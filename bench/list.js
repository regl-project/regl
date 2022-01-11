module.exports = {
  'clear': { proc: require('./clear'), warmupSamples: 10000, samples: 300000 },
  'cube-threejs': { proc: require('./cube-threejs'), warmupSamples: 30000, samples: 300000 },
  'cube': { proc: require('./cube'), warmupSamples: 30000, samples: 300000 },
  'cube-webgl': { proc: require('./cube-webgl'), warmupSamples: 30000, samples: 300000 },
  'buffer': { proc: require('./buffer'), warmupSamples: 30000, samples: 300000 },
  'draw-static': { proc: require('./draw-static'), warmupSamples: 30000, samples: 300000 },
  'draw-dynamic': { proc: require('./draw-dynamic'), warmupSamples: 30000, samples: 300000 },
  'draw-batch': { proc: require('./draw-batch'), warmupSamples: 30000, samples: 300000 },
  'draw-stream': { proc: require('./draw-stream'), warmupSamples: 30000, samples: 300000 }
}
