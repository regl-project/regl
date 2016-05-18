# Build environment

## Style

* `regl` ahderes to the [standard](https://github.com/feross/standard) style.
* Write all test cases, benchmarks and library code using strict ES5 style.
* Write examples using ES6

## Development set up

* To set up the development environment for regl, you first need to install [nodejs](https://nodejs.org/en/).  Any version >0.10 is supported.
* Once this is done, you can install regl's development dependencies using the following npm command:

```
npm install
```

## Testing and benchmarks

* regl uses [tape](https://www.npmjs.com/package/tape) for unit testing
* To run the test cases in node, use the following command:
```
npm run test
```
* To run the test cases in your web browser, use:
```
npm run test-browser
```
* To add a test case, create a new file in the `test/` folder and then add a reference to it in `test/util/index.js`
* To generate a code coverage report, you can run the following command.  A report webpage will the be generated in `coverage/lcov-report/index.html`
```
npm run coverage
```
* To run benchmarks, use this command:
```
npm run bench
```
* The easiest way to add a new benchmark is to copy an existing benchmark (see for example `bench/clear.js`), modify it, and add an entry to `bench/list.js`

## Building

* To rebuild all redistributable assets and the static website, use the command:
```
npm run build
```
* If you just want to modify the examples, you can do
```
npm run build-gallery
```

## How to help out

Check out the [change log](CHANGES.md) for planned features and tasks.  Alternatively, if you want to propose a new feature or report a bug, you should open an issue on GitHub.
