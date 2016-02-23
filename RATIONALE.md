# New abstractions for WebGL


The ultimate goal is to bring a system

* Interchangeability
* Composability


## Existing approaches

### Why using WebGL directly sucks

* Verbose
* Giant register machine
* Opaque errors, extremely fragile
* Complicated resource management
* Composability

### Conservative wrappers

Examples:

* stack.gl's `gl-*` modules
* TWGL


* Kills boilerplate (solves verbosity)
* Doesn't really solve the hard problems

### Immediate mode

* gl-vis



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

Nothing does this yet
