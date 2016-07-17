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
* To run the benchmarks, use this command:

```
npm run bench-node
```

This will run the benchmarks in `node.js`, and output the results to `stdout` in
json-format. If you want to see prettified benchmarks results, run

```
npm run bench-node -- --pretty
```

If you want to run the benchmarks in the browser, just run

```
npm run bench-browser
```

If you want to run the benchmarks on a bunch of commits in the history
of the repo, do

```
npm run bench-history 10
```

This script will, starting from the current HEAD, run the benchmarks
through all the 10 latest commits, and write all the benchmark data as json to a
file.

Note that the script will run `git stash` before switching to the old
commits, and then in the end it will switch to the original HEAD and run `git stash pop`,
in order to ensure that no uncommited changes are lost.

Also note that there is a so-called ancestor commit, and the script will NOT run any benchmarks beyond the ancestor commit. This is because that beyond this ancestor commit, the benchmarking environment had not yet been properly 
set up, so the benchmarking results produced by these commits should not be used. 

Then you can create pretty graphs from the benchmark data outputted
from `bench-history`. Just do

```
npm run bench-graph bench/bench-result-2f95fbcf3e60dff98c4b.json
```

where `bench/bench-result-2f95fbcf3e60dff98c4b.json` is the file
outputted by `bench-history`. The script will create an HTML-file with
graphs made with `d3` from the data, and automatically open the HTML-file
in your default browser.

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
