
module.exports = function (gl, extensions) {

  var extTimer = extensions.ext_disjoint_timer_query

  if (!extTimer) {
    return null
  }

  var pendingQueries = []
  var pendingStats = []

  var activeStats
  var activeQuery

  var queryPool = []

  function allocQuery () {
    return queryPool.pop() || extTimer.createQueryEXT()
  }

  function freeQuery (query) {
    queryPool.push(query)
  }

  function beginQuery (stats) {
    activeStats = stats

    activeQuery = allocQuery()
    extTimer.beginQueryEXT(extTimer.TIME_ELAPSED_EXT, activeQuery)
  }

  function endQuery () {
    extTimer.endQueryEXT(extTimer.TIME_ELAPSED_EXT)

    activeStats._startQueryIndex = pendingQueries.length
    activeStats._endQueryIndex = activeStats._startQueryIndex
    pendingQueries.push(activeQuery)

    pendingStats.push(activeStats)
  }

  function pushScopeStats(start, end, stats) {
    stats._startQueryIndex = start
    stats._endQueryIndex = end
    pendingStats.push(stats)
  }

  function update () {

    if (pendingQueries.length === 0) { // for first frame do nothing.
      return
    }

    results = []

    var i
    var j
    var start
    var end
    for (i = 0; i < pendingQueries.length; i++) {
/*
      if(true === extTimer.getQueryObjectEXT(pendingQueries[i], extTimer.QUERY_RESULT_AVAILABLE_EXT)) {
        console.log("NOT AVAIL")
      }*/

      results[i] = (1.0 / (1000.0 * 1000.0) ) * extTimer.getQueryObjectEXT(pendingQueries[i], extTimer.QUERY_RESULT_EXT)
      freeQuery(pendingQueries[i])
    }
    pendingQueries = []

    for (i = 0; i < pendingStats.length; i++) {
      var stats = pendingStats[i]
      for (j = stats._startQueryIndex; j <= stats._endQueryIndex; j++) {
        stats.gpuTime += results[j]
      }
    }

    pendingStats = []
  }

  return {
    beginQuery: beginQuery,
    endQuery: endQuery,
    update: update,
    getNumPendingQueries: function() {
      return pendingQueries.length
    },
    pushScopeStats: pushScopeStats
  }
}
