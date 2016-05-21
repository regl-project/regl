# Release notes

## Planned

* Support directly constructing elements and attributes from arrays
* Code generation rewrite
    + per-batch contexts
    + Allow for batch scopes
    + Stop using stacks for managing states, save state locally in command
* Error reporting
    + All error messages should link to command/resource declaration
    + Improve validation of vertex attributes
    + Improve validation of dynamic properties
* Code quality and contributing
    + Refactor attributeState, some names are inconsistent and code is too complex
    + Update development documentation
    + Add contributing guidelines and code of conduct
* Optimization
    + Save environment and this variables across batch mode invocations
    + Kill all VM bailouts on all major platforms
    + Kill all garbage collection
    + Optimize generated code
    + Optimize bundle size, remove string constants
* Expose limits for shader precision
* Support fixed scopes as arguments


* Resource API improvements
    + Support dynamic variables (context and props) in resource constructors
    + Add in place update methods to buffers and textures
    + Add support for polling buffers and animated GIFs (useful for web audio)
* Implement a standard method for handling context creation errors
* Add a mechanism for managing webgl extensions
    + Should be able to report errors when extensions are missing
    + Allow users to disable extensions for testing/mocking
* Cubic frame buffer objects
* WebVR support and integration (need to think how this will work)
* Documentation
    + Write "regl for react programmers"
    + Rewrite resource section, bring individual resources to the top
* Testing
    + Instancing
    + Texture generation
    + Framebuffers
    + Element buffer rendering primitives
    + Constant attributes
    + Viewport change notifications
    + RAF/frame behavior
    + Complete coverage for all code generation pathways
    + Test weird invocation sequences
* Benchmark suite
    + Dashboard for test cases and benchmarks
    + Create some more typical drawing examples
* Support more DDS texture formats (HDR, PVRTC, etc.)
* Build a website (@freeman-lab is on it!)
* Render to glTF (maybe?), could be useful for dumping previews
* Recipe book/example set
    + Minecraft example
    + Globe
    + Tile based 2D rendering
    + Compound scene
    + Shadow mapping
    + Stencil shadows
    + Turing patterns
    + Spring/cloth physics
    + Asset loading (obj, ply, etc.)

## Next

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
