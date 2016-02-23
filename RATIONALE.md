# New abstractions for WebGL

The high level goal of stack.gl is to deconstruct a 3D engine into reusable, interchangeable, composable modules.  More precisely, we mean that a module is,

* *Reusable* if it can be extracted from its original environment and used again
* *Interchangeable* if it can be replaced with a module having an equivalent interface
* *Composable* if it is composed itself of simpler, smaller modules

stack.gl is a loosely coupled collection of modules that communicate using standard interfaces.  At a high level, there are three basic parts of stack.gl,

* *Shader libraries*, and in particular [glslify](https://github.com/stackgl/glslify) which brings CommonJS modules to GLSL
* *Math and geometry tools*, which process arrays and indexed face sets
* *WebGL wrappers*, which abstract some of the boilerplate in WebGL

In the ecosystem, the shader and math parts have been far more successful than the core WebGL wrappers.  In part, this is at least because they are better defined problems with simpler interfaces.  Creating truly reusable WebGL abstractions beyond basic low level wrappers has so far proved elusive.  The goal of this document is to explore why this problem has been so much more difficult and to begin imagining what a solution might look like.

### Problems with WebGL

The simplest and most painful way to use WebGL is to just call the API directly. Unfortunately, WebGL is not very user friendly.  Initialization, resource binding, setting state flags, and so on are all extremely verbose.  At a higher level, the WebGL presents more serious problems from the perspective of code reuse.  It is essentially an enormous global state machine, which is controlled by registers and interrupts.  If a subroutine changes the state of this machine leaving it in an invalid or unexpected state, it may cause difficult to find errors in later rendering commands, often resulting in a mysterious blank screen. WebGL provides few error reporting and tracking mechanism to help programmers troubleshoot these problems.  Moreover, because of these complex non-local interactions it is difficult to reuse WebGL subroutines across different systems.

### Conservative wrapping

Wrapper libraries can reduce boilerplate by grouping common operations and setting sane defaults.  Libraries such as [stack.gl](http://stack.gl)'s `gl-shader, gl-buffer`, etc. or [twgl](http://twgljs.org/) provide shortcuts, while keeping the WebGL interface as a whole intact.  Killing duplicate code makes getting started with WebGL easier, but it is not enough to solve the hard problems of code reuse, coordination and resource management.

### Immediate mode

Immediate mode rendering is a minimal extension of direct wrapping which abstracts rendering of multiple draw calls using the composition of subroutines. State changes are tracked by pushing/popping to a stack, allowing for the procedural nesting. I think there is a strong case to be made that immediate mode rendering is an intuitive way to reason about computer graphics. Immediate concepts are present in "turtle graphics" systems like [Logo](https://en.wikipedia.org/wiki/Turtle_graphics) which are used to teach children basic programming skills. Historically, it is also how OpenGL 1.x worked. A more modern example is the [processing language](https://processing.org) or the DOM's [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API), both of which are popular with artists and creative/non-technical developers.

However, the convenience of immediate mode rendering comes at a cost. Modern GPUs are distributed systems, and the bus connecting them to the CPU has limited bandwidth and high latency. In order to take full advantage of their processing power it is necessary to cache data locally on the GPU and minimize this communication bottleneck. This is hard to do in the immediate mode rendering paradigm, since it encourages a style of development where resources are continuously resent from the CPU down to the GPU for each drawable object.



* Easier to extend immediate mode
* Complex resource life cycle management
    + initialization
    + render
    + update
    + destruction
* Hard to manage state transitions, can waste time rebinding
* Hard to share resources
* Multipass coordination is difficult

### Retained mode

Examples:

* THREE.js
* scenevr


* Easier for rendering engine to make holistic optimizations
* Coordination across objects (especially for multipass rendering, like picking, shadow mapping, reflections etc.) is easier to do


Negative:

* More concepts to learn up front.  Higher barrier to entry
* Need to synchronize scene graph state with rest of app.  Frequent use of weird hacks like 'dirty' flags, etc.
* Extending the system from the outside is harder.  Depending on a large system tends to make your code more fragile, breaking changes are more common


### Functional rendering

High level idea:

`render: scene props -> [draw calls]`

Simple, declarative, easy to reason about.  Unfortunately, also very slow if implemented naively.  So we need to turn this into
