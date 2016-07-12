module.exports = {
  'clear': {proc: require('./clear'), warmupSamples: 10, samples: 100},
  'cube': {proc: require('./cube'), warmupSamples: 3000, samples: 30000},
  'cube_webgl': {proc: require('./cube_webgl'), warmupSamples: 3000, samples: 30000}
  // 'buffer': require('./buffer'),
  // 'draw-static': require('./draw-static'),
  // 'draw-dynamic': require('./draw-dynamic'),
  // 'draw-batch': require('./draw-batch')
}
