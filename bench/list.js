module.exports = {
  'clear': {proc: require('./clear'), warmupSamples: 10, samples: 100},
  'cube': {proc: require('./cube'), warmupSamples: 50, samples: 1000}
  // 'buffer': require('./buffer'),
  // 'draw-static': require('./draw-static'),
  // 'draw-dynamic': require('./draw-dynamic'),
  // 'draw-batch': require('./draw-batch')
}
