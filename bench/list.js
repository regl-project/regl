module.exports = {
  'clear': {proc: require('./clear'), warmupSamples: 1000, samples: 30000},
  'cube-threejs': {proc: require('./cube-threejs'), warmupSamples: 3000, samples: 30000},
  'cube': {proc: require('./cube'), warmupSamples: 3000, samples: 30000},
  'cube-webgl': {proc: require('./cube-webgl'), warmupSamples: 3000, samples: 30000},
  'buffer': {proc: require('./buffer'), warmupSamples: 3000, samples: 30000},
  'draw-static': {proc: require('./draw-static'), warmupSamples: 3000, samples: 30000},
  'draw-dynamic': {proc: require('./draw-dynamic'), warmupSamples: 3000, samples: 30000},
  'draw-batch': {proc: require('./draw-batch'), warmupSamples: 3000, samples: 30000},
  'draw-stream': {proc: require('./draw-stream'), warmupSamples: 3000, samples: 30000}
}
