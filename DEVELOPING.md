# Build environment

## Style

`regl` uses [standard](https://github.com/feross/standard) style

## Testing

regl uses [tape](https://www.npmjs.com/package/tape)

### Running tests

#### In node
With headless-gl, you can just do:

```
npm run test
```

Which should run all test cases

#### In the browser

```
npm run test-browser
```

### Adding tests

## Benchmarks

### Running benchmarks

```
npm run bench
```

### Adding benchmarks
Copy an existing benchmark (see for example `bench/clear.js`) and add it to `bench/list.js`
