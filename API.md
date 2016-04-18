# REGL API

* [Initialization](#initialization)
      * [As a fullscreen canvas](#as-a-fullscreen-canvas)
      * [From a container div](#from-a-container-div)
      * [From a canvas](#from-a-canvas)
      * [From a WebGL context](#from-a-webgl-context)
  + [Initialization options](#initialization-options)
* [Commands](#commands)
  + [Dynamic properties](#dynamic-properties)
  + [Executing commands](#executing-commands)
    - [One-shot rendering](#one-shot-rendering)
    - [Batch rendering](#batch-rendering)
    - [Scoped parameters](#scoped-parameters)
  + [Parameters](#parameters)
    - [Shaders](#shaders)
    - [Uniforms](#uniforms)
    - [Attributes](#attributes)
    - [Drawing](#drawing)
    - [Render target](#render-target)
    - [Depth buffer](#depth-buffer)
    - [Blending](#blending)
    - [Stencil](#stencil)
    - [Polygon offset](#polygon-offset)
    - [Culling](#culling)
    - [Front face](#front-face)
    - [Dithering](#dithering)
    - [Line width](#line-width)
    - [Color mask](#color-mask)
    - [Sample coverage](#sample-coverage)
    - [Scissor](#scissor)
    - [Viewport](#viewport)
* [Resources](#resources)
  + [Basic usage](#basic-usage)
    - [Updating a resource](#updating-a-resource)
    - [Destroying a resource](#destroying-a-resource)
  + [Types](#types)
    - [Buffers](#buffers)
    - [Elements](#elements)
    - [Textures](#textures)
    - [Render buffers](#render-buffers)
    - [Frame buffers](#frame-buffers)
* [Other features](#other-features)
  + [Clear the draw buffer](#clear-the-draw-buffer)
  + [Reading pixels](#reading-pixels)
  + [Per-frame callbacks](#per-frame-callbacks)
  + [Frame stats](#frame-stats)
  + [Limits](#limits)
  + [Clean up](#clean-up)
  + [Context loss](#context-loss)

---------------------------------------
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

### Initialization options

**TODO**

---------------------------------------
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
---------------------------------------
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

---------------------------------------
### Executing commands
There are 3 ways to execute a command,

#### One-shot rendering
In one shot rendering the command is executed once and immediately,

```javascript
// Executes command immediately with no arguments
command()

// Executes a command using the specified arguments
command(args)
```

#### Batch rendering
A command can also be executed multiple times by passing a non-negative integer or an array as the first argument.  The `batchId` is initially `0` and incremented for each executed,

```javascript
// Executes the command `count`-times
command(count)

// Executes the command once for each args
command([args0, args1, args2, ..., argsn])
```

#### Scoped parameters
Commands can be nested using scoping.  If the argument to the command is a function then the command is evaluated and the state variables are saved as the defaults for all commands executed within its scope,

```javascript
command(function () {
  // ... execute sub commands
})

command(args, function () {
  // ... execute sub commands
})
```

---------------------------------------
### Parameters
The input to a command declaration is a complete description of the WebGL state machine.

---------------------------------------
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

**Note** Dynamic shaders are not allowed

**Related WebGL APIs**

* [`gl.createShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateShader.xml)
* [`gl.shaderSource`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glShaderSource.xml)
* [`gl.compileShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCompileShader.xml)
* [`gl.createProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateProgram.xml)
* [`gl.attachShader`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glAttachShader.xml)
* [`gl.linkProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glLinkProgram.xml)
* [`gl.useProgram`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glUseProgram.xml)

---------------------------------------
#### Uniforms
Uniform variables are specified in the `uniforms` block of the command.  For example,

```javascript
var command = regl({
  // ...

  vert: `
  struct SomeStruct {
    float value;
  };

  uniform vec4 someUniform;
  uniform int anotherUniform;
  uniform SomeStruct nested;

  void main() {
    gl_Position = vec4(1, 0, 0, 1);
  }`,

  uniforms: {
    someUniform: [1, 0, 0, 1],
    anotherUniform: regl.prop('myProp'),
    'nested.value', 5.3
  },

  // ...
})
```

**Notes**
* To specify uniforms in nested structs use the fully qualified path with dot notation
* Matrix uniforms are specified as flat length n^2 arrays without transposing

**Related WebGL APIs**

* [`gl.getUniformLocation`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetUniformLocation.xml)
* [`gl.uniform`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glUniform.xml)

---------------------------------------
#### Attributes
```javascript
var command = regl({
  // ...

  attributes: {
    position: regl.buffer([
      0, 1, 2,
      2, 3, 4,
      ...
    ]),

    normals: {
      buffer: regl.buffer([
        // ...
      ]),
      offset: 0,
      stride: 12,
      normalized: false,
      divisor: 0,
      size: 0
    },

    color: [1, 0, 1, 1]
  },

  // ...
})
```

Each attribute can have any of the following optional properties,

| Property | Description | Default |
|----------|-------------|---------|
| `buffer` | A `REGLBuffer` wrapping the buffer object | `null` |
| `offset` | The offset of the `vertexAttribPointer` in bytes | `0` |
| `stride` | The stride of the `vertexAttribPointer` in bytes | `0` |
| `normalized` | Whether the pointer is normalized | `false` |
| `size` | The size of the vertex attribute | Inferred from shader |
| `divisor` | Sets `gl.vertexAttribDivisorANGLE` | `0` * |

**Notes**
* Attribute size is inferred from the shader vertex attribute if not specified
* If a buffer is passed for an attribute then all pointer info is inferred
* If an array is passed to an attribute, then the vertex attribute is set to a constant
* `divisor` is only supported if the `ANGLE_instanced_arrays` extension is available

**Related WebGL APIs**

* [`gl.vertexAttribPointer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glVertexAttribPointer.xml)
* [`gl.vertexAttrib`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glVertexAttrib.xml)
* [`gl.getAttribLocation`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetAttribLocation.xml)
* [`gl.vertexAttibDivisor`](https://www.opengl.org/sdk/docs/man4/html/glVertexAttribDivisor.xhtml)
* [`gl.enableVertexAttribArray`, `gl.disableVertexAttribArray`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDisableVertexAttribArray.xml)

---------------------------------------
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

---------------------------------------
#### Render target

TODO

---------------------------------------
#### Depth buffer
All state relating to the depth buffer is stored in the `depth` field of the command.  For example,

```javascript
var command = regl({
  // ...

  depth: {
    enable: true,
    mask: true,
    func: 'less',
    range: [0, 1]
  },

  // ..
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.DEPTH_TEST)` | `true` |
| `mask` | Sets `gl.depthMask` | `true` |
| `range` | Sets `gl.depthRange` | `[0, 1]` |
| `func` | Sets `gl.depthFunc`. See table below for possible values | `'less'` |

**Notes**
* `depth.func` can take on the possible values

| Value | Description |
|-------|-------------|
| `'never'` | `gl.NEVER` |
| `'always'` | `gl.ALWAYS` |
| `'<', 'less'` | `gl.LESS` |
| `'<=', 'lequal'` | `gl.LEQUAL` |
| `'>', 'greater'` | `gl.GREATER` |
| `'>=', 'gequal'` | `gl.GEQUAL` |
| `'=', 'equal'` | `gl.EQUAL` |
| `'!=', 'notequal'` | `gl.NOTEQUAL` |

**Related WebGL APIs**

* [`gl.depthFunc`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthFunc.xml)
* [`gl.depthMask`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthMask.xml)
* [`gl.depthRange`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDepthRangef.xml)

---------------------------------------
#### Blending
Blending information is stored in the `blend` field,

```javascript
var command = regl({
  // ...

  blend: {
    enable: true,
    func: {
      srcRGB: 'src alpha',
      srcAlpha: 1,
      dstRGB: 'one minus src alpha',
      dstAlpha: 1
    },
    equation: {
      rgb: 'add',
      alpha: 'add'
    },
    color: [0, 0, 0, 0]
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.BLEND)` | `false` |
| `equation` | Sets `gl.blendEquation` (see table) | `'add'` |
| `func` | Sets `gl.blendFunc` (see table) | `{src:'src alpha',dst:'one minus src alpha'}` |
| `color` | Sets `gl.blendColor` | `[0, 0, 0, 0]` |

**Notes**
* `equation` can be either a string or an object with the fields `{rgb, alpha}`.  The former corresponds to `gl.blendEquation` and the latter to `gl.blendEquationSeparate`
* The fields of `equation` can take on the following values

| Equation | Description |
|----------|---------------|
| `'add'` | `gl.FUNC_ADD` |
| `'subtract'` | `gl.FUNC_SUBTRACT` |
| `'reverse subtract'` | `gl.FUNC_REVERSE_SUBTRACT` |
| `'min'` | `gl.MIN_EXT` |
| `'max'` | `gl.MAX_EXT` |

* `'min'` and `'max'` are only available if the `EXT_blend_minmax` extension is supported
* `func` can be an object with the fields `{src, dst}` or `{srcRGB, srcAlpha, dstRGB, dstAlpha}`, with the former corresponding to `gl.blendFunc` and the latter to `gl.blendFuncSeparate`
* The fields of `func` can take on the following values

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

---------------------------------------
#### Stencil

Example:

```javascript
var command = regl({
  // ...

  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: '<',
      ref: 0,
      mask: 0xff
    },
    opFront: {
      fail: 'keep',
      zfail: 'keep',
      pass: 'keep'
    },
    opBack: {
      fail: 'keep',
      zfail: 'keep',
      pass: 'keep'
    }
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.STENCIL_TEST)` | `false` |
| `mask` | Sets `gl.stencilMask` | `-1` |
| `func` | Sets `gl.stencilFunc` | `{cmp:'always',ref:0,mask:-1}` |
| `opFront` | Sets `gl.stencilOpSeparate` for front face | `{fail:'keep',zfail:'keep',pass:'keep'}` |
| `opBack` | Sets `gl.stencilOpSeparate` for back face | `{fail:'keep',zfail:'keep',pass:'keep'}` |

**Notes**

* `func` is an object which configures the stencil test function. It has 3 properties,
    + `cmp` which is the comparison function
    + `ref` which is the reference value
    + `mask` which is the comparison mask
* `func.cmp` is a comparison operator which takes one of the following values,

| Value | Description |
|-------|-------------|
| `'never'` | `gl.NEVER` |
| `'always'` | `gl.ALWAYS` |
| `'<', 'less'` | `gl.LESS` |
| `'<=', 'lequal'` | `gl.LEQUAL` |
| `'>', 'greater'` | `gl.GREATER` |
| `'>=', 'gequal'` | `gl.GEQUAL` |
| `'=', 'equal'` | `gl.EQUAL` |
| `'!=', 'notequal'` | `gl.NOTEQUAL` |

* `opFront` and `opBack` specify the stencil op.  Each is an object which takes the following parameters:
    + `fail`, the stencil op which is applied when the stencil test fails
    + `zfail`, the stencil op which is applied when the stencil test passes and the depth test fails
    + `pass`, the stencil op which is applied when both stencil and depth tests pass
* Values for `opFront.fail`, `opFront.zfail`, etc. can come from the following table

| Stencil Op | Description |
|------------|-------------|
| `'zero'` | `gl.ZERO` |
| `'keep'` | `gl.KEEP` |
| `'replace'` | `gl.REPLACE` |
| `'invert'` | `gl.INVERT` |
| `'increment'` | `gl.INCR` |
| `'decrement'` | `gl.DECR` |
| `'increment wrap'` | `gl.INCR_WRAP` |
| `'decrement wrap'` | `gl.DECR_WRAP` |

**Related WebGL APIs**

* [`gl.stencilFunc`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glStencilFunc.xml)
* [`gl.stencilMask`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glStencilMask.xml)
* [`gl.stencilOpSeparate`](http://www.khronos.org/opengles/sdk/2.0/docs/man/xhtml/glStencilOpSeparate.xml)

---------------------------------------
#### Polygon offset

Polygon offsetting behavior can be controlled using the `polygonOffset` field,

```javascript
var command = regl({
  // ...

  polygonOffset: {
    enable: true,
    offset: {
      factor: 1,
      units: 0
    }
  }

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.POLYGON_OFFSET_FILL)` | `false` |
| `offset` | Sets `gl.polygonOffset` | `{factor:0, units:0}` |

**Related WebGL APIs**

* [`gl.polygonOffset`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glPolygonOffset.xml)

---------------------------------------
#### Culling
Example,

```javascript
var command = regl({
  // ...

  cull: {
    enable: true,
    face: 'back'
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.CULL_FACE)` | `false` |
| `face` | Sets `gl.cullFace` | `'back'` |

**Notes**

* `face` must be one of the following values,

| Face | Description |
|------|-------------|
| `'front'` | `gl.FRONT` |
| `'back'` | `gl.BACK` |

**Relevant WebGL APIs**

* [`gl.cullFace`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCullFace.xml)

---------------------------------------
#### Front face
Example,

```javascript
var command = regl({
  // ...

  frontFace: 'cw',

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `frontFace` | Sets `gl.frontFace` | `'ccw'` |

**Notes**

* The value for front face must be one of the following,

| Orientation | Description |
|------|-------------|
| `'cw'` | `gl.CW` |
| `'ccw'` | `gl.CCW` |

**Relevant WebGL APIs**

* [`gl.frontFace`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glFrontFace.xml)

---------------------------------------
#### Dithering
Example,

```javascript
var command = regl({
  // ...

  dither: true,

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `dither` | Toggles `gl.DITHER` | `false` |

---------------------------------------
#### Line width
Example,

```javascript
var command = regl({
  // ...

  lineWidth: 4,

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `lineWidth` | Sets `gl.lineWidth` | `1` |

**Relevant WebGL APIs**

* [`gl.lineWidth`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glLineWidth.xml)

---------------------------------------
#### Color mask
Example,

```javascript
var command = regl({
  // ...

  colorMask: [true, false, true, false],

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `colorMask` | Sets `gl.colorMask` | `[true, true, true, true]` |

**Relevant WebGL APIs**

* [`gl.colorMask`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glColorMask.xml)

---------------------------------------
#### Sample coverage
Example,

```javascript
var command = regl({
  // ...

  sample: {
    enable: true,
    alpha: false,
    coverage: {
      value: 1,
      invert: false
    }
  },

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.SAMPLE_COVERAGE)` | `false` |
| `alpha` | Toggles `gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE)` | `false` |
| `coverage` | Sets `gl.sampleCoverage` | `{value:1,invert:false}` |

**Relevant WebGL APIs**

* [`gl.sampleCoverage`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glColorMask.xml)

---------------------------------------
#### Scissor
Example,

```javascript
var command = regl({
  // ...

  scissor: {
    enable: true,
    box: {
      x: 10,
      y: 20,
      w: 100,
      h: 100
    }
  }

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `enable` | Toggles `gl.enable(gl.SCISSOR)` | `false` |
| `box` | Sets `gl.scissor` | `{x:0,y:0}` |

**Notes**
* `box` is the shape of the scissor region, it takes the following parameters
    + `x` is the left coordinate of the box, default `0`
    + `y` is the top coordiante of the box, default `0`
    + `w` is the width of the box, default fbo width - `x`
    + `h` is the height of the box, default fbo height - `y`

**Relevant WebGL APIs**

* [`gl.scissor`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glScissor.xml)

---------------------------------------
#### Viewport
Example,

```javascript
var command = regl({
  // ...

  viewport: {
    x: 5,
    y: 10,
    w: 100,
    h: 50
  }

  // ...
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `viewport` | The shape of viewport | `{}` |

**Notes**

* Like `scissor.box`, `viewport` is a bounding box with properties `x,y,w,h`

**Relevant WebGL APIs**

* [`gl.viewport`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glViewport.xml)

---------------------------------------
## Resources
Besides commands, the other major component of regl are resources.  Resources are GPU resident objects which are managed explicitly by the programmer.  Each resource follows a the same life cycle of create/read/update/delete.

### Basic usage

---------------------------------------
#### Updating a resource

```javascript
resource(options)
```

---------------------------------------
#### Destroying a resource

```javascript
resource.destroy()
```


---------------------------------------
### Types

---------------------------------------
#### Buffers
Examples,

```javascript
// Creates an empty length 100 buffer
var zeroBuffer = regl.buffer(100)

// A buffer with float data
var floatBuffer = regl.buffer(new Float32Array([1, 2, 3, 4]))

// A streaming buffer of bytes
var streamBuffer = regl.buffer({
  usage: 'stream',
  data: new Uint8Array([2, 4, 6, 8, 10])
})

// An unpacked buffer of position data
var positionBuffer = regl.buffer([
  [1, 2, 3],
  [4, 5, 6],
  [2, 1, -2]
])
```

| Property | Description | Default |
|----------|-------------|---------|
| `data` | The data for the vertex buffer (see below) | `null` |
| `length` | If `data` is `null` or not present reserves space for the buffer | `0` |
| `usage` | Sets array buffer usage hint | `'static'` |

| Usage Hint | Description |
|------------|-------------|
| `'static'` | `gl.DRAW_STATIC` |
| `'dynamic'` | `gl.DYNAMIC_DRAW` |
| `'stream'` | `gl.STREAM_DRAW` |

**Relevant WebGL APIs**

* [`gl.createBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateBuffer.xml)
* [`gl.deleteBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteBuffer.xml)
* [`gl.bufferData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferData.xml)

---------------------------------------
#### Elements
Examples,

```javascript
var triElements = regl.elements([
  [1, 2, 3],
  [0, 2, 5]
])

var starElements = regl.elements({
  primitive: 'line loop',
  count: 5,
  data: new Uint8Array([0, 2, 4, 1, 3])
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `data` | | `null` |
| `length` | | `0` |
| `usage` | | `'static'` |
| `primitive` | | `'triangles'` |
| `count` | | `0` |

* `usage` must take on one of the following values

| Usage Hint | Description |
|------------|-------------|
| `'static'` | `gl.DRAW_STATIC` |
| `'dynamic'` | `gl.DYNAMIC_DRAW` |
| `'stream'` | `gl.STREAM_DRAW` |

* `primitive` can be one of the following primitive types

| Primitive type | Description |
|-------|-------------|
| `'points'` | `gl.POINTS` |
| `'lines'` | gl.LINES` |
| `'line strip'` | `gl.LINE_STRIP` |
| `'line loop` | `gl.LINE_LOOP` |
| `'triangles` | `gl.TRIANGLES` |
| `'triangle strip'` | `gl.TRIANGLE_STRIP` |
| `'triangle fan'` | `gl.TRIANGLE_FAN` |

**Relevant WebGL APIs**

* [`gl.createBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateBuffer.xml)
* [`gl.deleteBuffer`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteBuffer.xml)
* [`gl.bufferData`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBufferData.xml)
* [`gl.drawElements`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDrawElements.xml)

---------------------------------------
#### Textures
There are many ways to upload data to a texture in WebGL.  As with drawing commands, regl consolidates all of these crazy configuration parameters into one function.  Here are some examples of how to create a texture,

```javascript
// From size parameters
var emptyTexture = regl.texture({
  shape: [16, 16]
})

// From a flat array
var typedArrayTexture = regl.texture({
  width: 2,
  height: 2,
  data: [
    255, 255, 255, 255, 0, 0, 0, 0,
    255, 0, 255, 255, 0, 0, 255, 255
  ]
})

// From a square array
var nestedArrayTexture = regl.texture([
  [ [0, 255, 0],  [255, 0, 0] ],
  [ [0, 0, 255], [255, 255, 255] ]
])

// From an ndarray-like object
var ndarrayTexture = regl.texture(require('baboon-image'))

// Manual mipmap specification
var mipmapTexture = regl.texture({
  minFilter: 'mipmap'
})

// From an image element
var image = new Image()
image.src = 'http://mydomain.com/myimage.png'
var imageTexture = regl.texture(image)

// From a canvas
var canvas = document.createElement(canvas)
var context2D = canvas.getContext('2d')
var canvasTexture = regl.texture(canvas)
var otherCanvasTexture = regl.texture(context2D)

// From a video element
var video = document.querySelector('video')
var videoTexture = regl.texture(video)

// From the pixels in the current frame buffer
var copyPixels = regl.texture({
  x: 5,
  y: 1,
  width: 10,
  height: 10,
  copy: true
})
```

| Property | Description | Default |
|----------|-------------|---------|
| `width` | Width of texture | `0` |
| `height` | Height of texture | `0`
| `mag` | Sets magnification filter (see table) | `'nearest'` |
| `min` | Sets minification filter (see table) | `'nearest'` |
| `wrapS` | Sets wrap mode on S axis (see table) | `'repeat'` |
| `wrapT` | Sets wrap mode on T axis (see table) | `'repeat'` |
| `aniso` | Sets number of anisotropic samples, requires [EXT_texture_filter_anisotropic](https://www.khronos.org/registry/webgl/extensions/EXT_texture_filter_anisotropic/) | `0` |
| `format` | Texture format (see table) | `'rgba'` |
| `type` | Texture type (see table) | `'uint8'` |
| `data` | Input data (see below) | |
| `mipmap` | If set, regenerate mipmaps | `false` |
| `flipY` | Flips textures vertically when uploading | `false` |
| `alignment` | Sets unpack alignment per pixel | `1` |
| `premultiplyAlpha` | Premultiply alpha when unpacking | `false` |
| `colorSpace` | Sets colorspace conversion | `'browser'` |
| `poll` | If set, then each frame check if this texture needs to be reuploaded | Depends on the element type |

* `shape` can be used as an array shortcut for `[width, height, channels]` of image
* `radius` can be specified for square images and sets both `width` and `height`
* `data` can take one of the following values,

| Data type | Description |
|-----------|-------------|
| Array | Interpreted as array of pixel values with type based on the input type |
| Rectangular array of arrays | Interpreted as 2D array of arrays |
| Typed array | A binary array of pixel values |
| `ndarray` | Any object with a `shape, stride, offset, data` |
| Image | An HTML image element |
| Video | An HTML video element |
| Canvas | A canvas element |
| Context 2D | A canvas 2D context |
| String | A URL to an image or video to load |

* If an image element is specified and not yet loaded, then regl will upload a temporary image and hook a callback on the image
* If a video element is specified, then regl will reupload a frame of the video element each tick unless `poll` is set to false
* `mag` sets `gl.MAG_FILTER` for the texture and can have one of the following values

| Mag filter | Description |
|------------|-------------|
| `'nearest'` | `gl.NEAREST` |
| `'linear'` | `gl.LINEAR` |

* `min` sets `gl.MIN_FILTER` for the texture, and can take on one of the following values,

| Min filter | Description |
|------------|-------------|
| `'nearest'` | `gl.NEAREST` |
| `'linear'` | `gl.LINEAR` |
| `'mipmap', 'linear mipmap linear'` | `gl.LINEAR_MIPMAP_LINEAR` |
| `'nearest mipmap linear'` | `gl.NEAREST_MIPMAP_LINEAR` |
| `'linear mipmap nearest'` | `gl.LINEAR_MIPMAP_NEAREST` |
| `'nearest mipmap nearest'` | `gl.NEAREST_MIPMAP_NEAREST` |

* `wrap` can be used as an array shortcut for `[wrapS, wrapT]`
* `wrapS` and `wrapT` can have any of the following values,

| Wrap mode | Description |
|-----------|-------------|
| `'repeat'` | `gl.REPEAT` |
| `'clamp'` | `gl.CLAMP_TO_EDGE` |
| `'mirror'` | `gl.MIRRORED_REPEAT` |

* `format` determines the format of the texture and possibly the type.  Possible values for `format` include,

| Format | Description | Channels | Types | Compressed? | Extension? |
|--------|-------------|----------|-------|------|------------|
| `'alpha'` | `gl.ALPHA` | 1 | `'uint8','half float','float'` | ✖ | |
| `'luminance'` | `gl.LUMINANCE` | 1 | `'uint8','half float','float'` | ✖ | |
| `'luminance alpha'` | `gl.LUMINANCE_ALPHA` | 2 | `'uint8','half float','float'` | ✖ | |
| `'rgb'` | `gl.RGB` | 3 | `'uint8','half float','float'` | ✖ | |
| `'rgba'` | `gl.RGBA` | 4  | `'uint8','half float','float'`| ✖ | |
| `'rgba4'` | `gl.RGBA4` | 4 | `'rgba4'` | ✖ | |
| `'rgb5 a1'` | `gl.RGB5_A1` | 4 | `'rgb5 a1'` | ✖ | |
| `'rgb5'` | `gl.RGB5` | 3 | `'rgb5'` | ✖ | |
| `'srgb'` | `ext.SRGB` | 3 | `'uint8','half float','float'` | ✖ | [EXT_sRGB](https://www.khronos.org/registry/webgl/extensions/EXT_sRGB/) |
| `'srgba'` | `ext.RGBA` | 4  | `'uint8','half float','float'`| ✖ | [EXT_sRGB](https://www.khronos.org/registry/webgl/extensions/EXT_sRGB/) |
| `'depth'` | `gl.DEPTH_COMPONENT` | 1 | `'uint16','uint32'`  | ✖ | [WEBGL_depth_texture](https://www.khronos.org/registry/webgl/extensions/WEBGL_depth_texture/) |
| `'depth stencil'` | `gl.DEPTH_STENCIL` | 2 | `'depth stencil'` | ✖ | [WEBGL_depth_texture](https://www.khronos.org/registry/webgl/extensions/WEBGL_depth_texture/) |
| `'rgb s3tc dxt1'` | `ext.COMPRESSED_RGB_S3TC_DXT1_EXT` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgba s3tc dxt1'` | `ext.COMPRESSED_RGBA_S3TC_DXT1_EXT` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgba s3tc dxt3'` | `ext.COMPRESSED_RGBA_S3TC_DXT3_EXT` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgba s3tc dxt5'` | `ext.COMPRESSED_RGBA_S3TC_DXT5_EXT` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_s3tc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/) |
| `'rgb arc'` | `ext.COMPRESSED_RGB_ATC_WEBGL` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_atc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_atc/) |
| `'rgba arc explicit alpha'` | `ext.COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_atc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_atc/) |
| `'rgba arc interpolated alpha'` | `ext.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_atc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_atc/) |
| 'rgb pvrtc 4bppv1' | `ext.COMPRESSED_RGB_PVRTC_4BPPV1_IMG` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| 'rgb pvrtc 2bppv1' | `ext.COMPRESSED_RGB_PVRTC_2BPPV1_IMG` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| 'rgba pvrtc 4bppv1' | `ext.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| 'rgba pvrtc 2bppv1' | `ext.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG` | 4 | `'uint8'` | ✓ | [WEBGL_compressed_texture_pvrtc](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/) |
| `'rgb etc1'` | `ext.COMPRESSED_RGB_ETC1_WEBGL` | 3 | `'uint8'` | ✓ | [WEBGL_compressed_texture_etc1](https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_etc1/) |

* In many cases `type` can be inferred from the format and other information in the texture.  However, in some situations it may still be necessary to set it manually.  In such an event, the following values are possible,

| Type | Description |
|------|-------------|
| `'uint8'` | `gl.UNSIGNED_BYTE` |
| `'uint16'` | `gl.UNSIGNED_SHORT` |
| `'uint32'` | `gl.UNSIGNED_INT` |
| `'float'` | `gl.FLOAT` |
| `'half float'` | `ext.HALF_FLOAT_OES` |

* `colorSpace` sets the WebGL color space flag for pixel unpacking

| Color space | Description |
|------------|-------------|
| `'none'` | `gl.NONE` |
| `'browser'` | `gl.BROWSER_DEFAULT_WEBGL` |

* `unpackAlignment` sets the pixel unpack alignment and must be one of `[1, 2, 4, 8]`

**Relevant WebGL APIs**

* [`gl.createTexture`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCreateTexture.xml)
*  [`gl.deleteTexture`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glDeleteTexture.xml)
* [`gl.texParameter`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glTexParameter.xml)
*  [`gl.pixelStorei`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glPixelStorei.xml)
* [`gl.texImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glTexImage2D.xml)
* [`gl.texImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glTexImage2D.xml)
* [`gl.compressedTexImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCompressedTexImage2D.xml)
* [`gl.copyTexImage2D`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glCopyTexImage2D.xml)
* [`gl.generateMipmap`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGenerateMipmap.xml)

---------------------------------------
#### Render buffers

**NOT YET IMPLEMENTED**

---------------------------------------
#### Frame buffers

**NOT YET IMPLEMENTED**

---------------------------------------
## Other features
Other than draw commands and resources, there are a few miscellaneous parts of the WebGL API which REGL wraps for completeness.

---------------------------------------
### Clear the draw buffer
`regl.clear` combines `gl.clearColor, gl.clearDepth, gl.clearStencil` and `gl.clear` into a single procedure, which has the following usage:

```javascript
regl.clear({
  color: [0, 0, 0, 1],
  depth: 1,
  stencil: 0
})
```

| Property | Description |
|----------|-------------|
| `color` | Sets the clear color |
| `depth` | Sets the clear depth value |
| `stencil` | Sets the clear stencil value |

If an option is not present, then the corresponding buffer is not cleared

**Relevant WebGL APIs**

* [`gl.clearColor`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClearColor.xml)
* [`gl.clearDepth`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClearDepth.xml)
* [`gl.clearStencil`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClearStencil.xml)
* [`gl.clear`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glClear.xml)

---------------------------------------
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

**Relevant WebGL APIs**

* [`gl.pixelStorei`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glPixelStorei.xml)
* [`gl.readPixels`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glReadPixels.xml)

---------------------------------------
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

---------------------------------------
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

---------------------------------------
### Limits
regl exposes info about the WebGL context limits and capabilities via the `regl.limits` object.  The following properties are supported,

| Property | Description |
|----------|-------------|
| `colorBits` | An array of bits depths for the red, green, blue and alpha channels |
| `depthBits` | Bit depth of drawing buffer |
| `stencilBits` | Bit depth of stencil buffer |
| `subpixelBits` | `gl.SUBPIXEL_BITS` |
| `extensions` | A list of all supported extensions |
| `pointSizeRange` | `gl.ALIASED_POINT_SIZE_RANGE` |
| `lineWidthRange` | `gl.ALIASED_LINE_WIDTH_RANGE` |
| `viewport` | `gl.MAX_VIEWPORT_DIMS` |
| `combinedTextureUnits` | `gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS` |
| `cubeMapSize` | `gl.MAX_CUBE_MAP_TEXTURE_SIZE` |
| `renderbufferSize` | `gl.MAX_RENDERBUFFER_SIZE` |
| `texUnits` | `gl.MAX_TEXTURE_IMAGE_UNITS` |
| `textureSize` | `gl.MAX_TEXTURE_SIZE` |
| `attributes` | `gl.MAX_VERTEX_ATTRIBS` |
| `vertexUniforms` | `gl.MAX_VERTEX_UNIFORM_VECTORS` |
| `vertexTextureUnits` | `gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS` |
| `varyingVectors` | `gl.MAX_VARYING_VECTORS` |
| `fragmentUniforms` | `gl.MAX_FRAGMENT_UNIFORM_VECTORS` |
| `glsl` | `gl.SHADING_LANGUAGE_VERSION` |
| `renderer` | `gl.RENDERER` |
| `vendor` | `gl.VENDOR` |
| `version` | `gl.VERSION` |

**Relevant WebGL APIs**

* [`gl.getParameter`](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glGetParameter.xml)

---------------------------------------
### Clean up

```javascript
regl.destroy()
```

---------------------------------------
### Context loss
`regl` makes a best faith effort to handle context loss by default.  This means that buffers and textures are reinitialized on a context restore with their contents.
