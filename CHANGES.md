# Release notes

## 2.1.1

* A small maintenance release that removes dist files from source control ([#676](https://github.com/regl-project/regl/pull/676)), upgrades headless-gl for dev ([#675](https://github.com/regl-project/regl/pull/675)), and adds missing TypeScript declarations ([#674](https://github.com/regl-project/regl/pull/674)). It should contain no changes to runtime execution.

## 1.6.1

* Browsers select their own, perhaps inconsistent, default for the `premultipledAlpha` context creation attribute. Regl enforces consistency by filling in unspecified values but since 1.4.0 has enforced `false` if unspecified, which seems to be nonstandard and in the minority. For improved backward compatibility, this PR sets `premultipledAlpha: true` when not explicitly specified. ([#566](https://github.com/regl-project/regl/pull/566), [#567](https://github.com/regl-project/regl/pull/567))

## 1.6.0 (Do not use)

* Faulty fix for [#566](https://github.com/regl-project/regl/pull/566)

## 1.5.2

* Remove an additional ES6 keyword ([#564](https://github.com/regl-project/regl/pull/564))

## 1.5.1

* Remove accidental inclusion of ES6 keywords ([#562](https://github.com/regl-project/regl/pull/562))

## 1.5.0

* Resize canvas using ResizeObserver, if available. ([#556](https://github.com/regl-project/regl/pull/556))

## 1.4.2

* Fix publishing error. Rebuild files in `dist` to match source.

## 1.4.1

* Fix a bug in vertex array objects when used as static resources

## 1.4.0

* Add vertex array objects via regl.vao

## 1.3.0

* Add `framebuffer.use()` method for quickly setting up framebuffer objects
* `regl.clear` and `regl.read` now accept a framebuffer as a parameter

## 1.2.1

* Fixed bug with depth and stencil attachments being cleared
* `regl.elements` now correctly infers count from length and vice-versa

## 1.2.0

* Simplified flattening logic for textures and buffers
* Viewport and scissor box can go outside drawing buffer

## 1.1.1

* Fix bug with buffers and elements not updating type correctly

## 1.1.0

* Can now access format and filtering mode for textures and render buffers

## 1.0.0

* Support `stencil.op`
* Rename stencil op `pass` to `zpass`
* Attribute pointers can now use buffer literals
* Implement basic context loss handling
* Add `regl.on` for hooking events
* Add `regl.now()`, allows sampling timer at high resolution outside of `regl.frame` in order to better synchronize DOM events

## 0.11.0

* Cubic frame buffer objects!
* Can now use framebuffers as textures in uniforms.  By default color attachment 0 is used.
* Support for dynamic properties with nested objects like attributes
* Alias `float16` for `half float` and `float32` for `float`
* Many bug fixes and stability improvements
* Website mostly works (preview at [regl.party](http://regl.party))
* Gallery of examples with movies

## 0.10.0

* Add a mechanism for managing webgl extensions

  * Should be able to report errors when extensions are missing
  * Allow users to disable extensions for testing/mocking

* Doc clean up

* Add more test cases for `regl.read()` and improve validation

* Implement a standard method for handling context creation errors

* Fix several bugs related to `regl.frame` cancellation

## 0.9.0

* Add performance monitoring hooks for commands.  Now tracks draw call count, cpu time and gpu time (if disjoint timer extension supported).
* Performance monitoring hooks for commands can be enabled/disabled using the `profile` property.
* Finish API documentation for framebuffers
* Optimize constructors/updates for framebuffers
* More test cases for framebuffers
* Clean up renderbuffer constructor and improve test coverage
* Added `resize` method to textures, renderbuffers and framebuffers
* Added global performance monitoring hooks via `regl.stats`
* Rename `count` context variable to `tick`
* Remove `deltaTime` context variable
* Uniform validation fixes
* Texture construction fixes
* Improved test coverage for uniform variables

## 0.8.0

* Optimize texture and cubemap constructors
* Add in place update method for textures via `texture.subimage`
* Remove DDS parsing
* Remove URL loader for textures
* Improve texture test cases

## 0.7.0

* Add in place update methods to buffers and elements via `buffer.subdata` and `elements.subdata`
* Pool stream buffers
* Rewrite resource section of API, bring individual resources to the top
* Optimized buffer and elements creation, no more memory allocation
* More test cases for textures

## 0.6.0

* Allow for dynamic properties in viewport, scissor box and attributes

* Switch order of arguments to dynamic functions, from (props, context) to (context, props)

  * functions without a props argument become batch static

* Implement non-batch constant context, framebuffer and viewport

* Batched scope rendering

* Switch order of props and context variables for dynamic function args

* function invocation now takes batch id as separate parameter

* Support directly constructing elements and attributes from arrays

* Allow individual attribute properties to be dynamic (eg buffers, offsets, etc.)

* Code generation rewrite

  * State flag polling is now inlined
  * draw and batch inlined for static shaders
  * constants are inlined
  * fewer arguments passed to generated code
  * Stop using separate arrays for stacks to manage state, instead state is saved onto the call stack

* Error reporting

  * All error messages should link to command/resource declaration
  * Improve validation of vertex attributes
  * Improve validation of dynamic properties

* Code quality and contributing

  * Combined lib/state.js and lib/compile.js into lib/core.js
  * Delete most of lib/attribute.js
  * Update development documentation

* Expose limits for shader precision

## 0.5.0

* Context variables

* Use `this` argument effectively

  * Should pass this to dynamic attributes and scope

* Make scopes and dynamic attributes take same argument

* Combine batchId with stats argument

* Pass `this` to draw commands so that they can be stored as members

## 0.4.0

* Circle CI finally passes!
* Use numeric ids instead of strings for shader sources
* Shader error messages are better
* Browserify transform to remove all runtime checks
* Shader linking is deferred until draw call, enables partial shaders in scope
* Report errors for missing attributes, uniforms and vertex count

## 0.3.0

* added renderbuffers (via regl.renderbuffer)
* added framebuffer objects (via regl.framebuffer)
* regl.buffer and regl.elements can now take ndarray-like inputs
* Switch to using Google closure compiler for minified builds

## 0.2.0

* Texture support implemented, but not well tested
* Fix attribute binding bug

## 0.1.0

* Actually kind of works now!
* All draw state and WebGL state except textures, renderbuffers and frame buffers wrapped
* Changed the arguments to dynamic functions.  Now they take (args, batchId, stats) instead of (frameCount, batchId)
* Tons of code generation improvements and bug fixing
* Unit tests!
* Code coverage metrics! (not good yet)
* API docs!

## 0.0.0

* First published to npm
