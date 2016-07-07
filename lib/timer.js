
module.exports = function (gl, extensions) {
  var extTimer = extensions.ext_disjoint_timer_query

  if (!extTimer) {
    return null
  }

  var pendingQueries = []
  var pendingStats = []

  var activeStats
  var activeQuery

  // QUERY POOL BEGIN
  var queryPool = []
  function allocQuery () {
    // TODO: we need to destroy the allocated queries somewhere.
    return queryPool.pop() || extTimer.createQueryEXT()
  }
  function freeQuery (query) {
    queryPool.push(query)
  }
  // QUERY POOL END

  function PendingStats () {
    this.startQueryIndex = -1
    this.endQueryIndex = -1
    this.stats = null
  }

  //
  // Pending stats pool.
  //
  var pendingStatsPool = []
  function allocPendingStats() {
    return pendingStatsPool.pop() || new PendingStats()
  }
  function freePendingStats (pendingStats) {
    pendingStatsPool.push(pendingStats)
  }

  function beginQuery (stats) {
    activeStats = stats
    activeQuery = allocQuery()

    extTimer.beginQueryEXT(extTimer.TIME_ELAPSED_EXT, activeQuery)
  }

  function endQuery () {
    extTimer.endQueryEXT(extTimer.TIME_ELAPSED_EXT)

    var ps = allocPendingStats()
    ps.startQueryIndex = pendingQueries.length
    ps.endQueryIndex = ps.startQueryIndex
    ps.stats = activeStats
    pendingQueries.push(activeQuery)

    pendingStats.push(ps)
  }

  function pushScopeStats (start, end, stats) {
    var ps = allocPendingStats()
    ps.startQueryIndex = start
    ps.endQueryIndex = end
    ps.stats = stats

    pendingStats.push(ps)
  }

  function update () {
    if (pendingQueries.length === 0) { // for first frame do nothing.
      return
    }

    var results = []

    var i
    var j
    for (i = 0; i < pendingQueries.length; i++) {

      results[i] = (1.0 / (1000.0 * 1000.0)) * extTimer.getQueryObjectEXT(pendingQueries[i], extTimer.QUERY_RESULT_EXT)

      freeQuery(pendingQueries[i])
    }
    pendingQueries = []

    for (i = 0; i < pendingStats.length; i++) {
      var ps = pendingStats[i]
    //  console.log("ps, ", ps )
      for (j = ps.startQueryIndex; j <= ps.endQueryIndex; j++) {
        ps.stats.gpuTime += results[j]
      }
      freePendingStats(ps)
    }

    pendingStats = []
  }

  return {
    beginQuery: beginQuery,
    endQuery: endQuery,
    update: update,
    getNumPendingQueries: function () {
      return pendingQueries.length
    },
    pushScopeStats: pushScopeStats
  }
}
