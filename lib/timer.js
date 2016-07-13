var GL_QUERY_RESULT_EXT = 0x8866
var GL_QUERY_RESULT_AVAILABLE_EXT = 0x8867
var GL_TIME_ELAPSED_EXT = 0x88BF

module.exports = function (gl, extensions) {
  var extTimer = extensions.ext_disjoint_timer_query

  if (!extTimer) {
    return null // the entire timer will just be null, if no extension.
  }

  var pendingQueries = []
  var pendingStats = []

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

  //
  // Pending stats pool.
  //
  function PendingStats () {
    this.startQueryIndex = -1
    this.endQueryIndex = -1
    this.stats = null
  }
  var pendingStatsPool = []
  function allocPendingStats () {
    return pendingStatsPool.pop() || new PendingStats()
  }
  function freePendingStats (pendingStats) {
    pendingStatsPool.push(pendingStats)
  }
  // Pending stats pool end

  function beginQuery () {
    var query = allocQuery()
    extTimer.beginQueryEXT(GL_TIME_ELAPSED_EXT, query)
    return query
  }

  function endQuery (stats, query) {
    extTimer.endQueryEXT(GL_TIME_ELAPSED_EXT)

    var ps = allocPendingStats()
    // for a non-scope query, the query only encompasses a single
    // draw command, so start and end are identical.
    ps.startQueryIndex = pendingQueries.length
    ps.endQueryIndex = ps.startQueryIndex
    ps.stats = stats

    pendingStats.push(ps)
    pendingQueries.push(query)
  }

  function pushScopeStats (start, end, stats) {
    var ps = allocPendingStats()
    ps.startQueryIndex = start
    ps.endQueryIndex = end
    ps.stats = stats

    pendingStats.push(ps)
  }

  // we should call this at the beginning of the frame,
  // in order to update gpuTime
  function update () {
    if (pendingQueries.length === 0) { // for first frame do nothing.
      return
    }
    // from the pending queries, retrieve all the query results.
    var ptr = 0
    for (var i = 0; i < pendingQueries.length; i++) {
      var query = pendingQueries[i]
      var stats = pendingStats[i]
      if (extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_AVAILABLE_EXT)) {
        var result = extTimer.getQueryObjectEXT(query, GL_QUERY_RESULT_EXT)
        stats.stats.gpuTime += 1e-6 * result
        freeQuery(query)
        freePendingStats(stats)
      } else {
        // leave uncompleted queries in the queue
        pendingQueries[ptr] = query
        pendingStats[ptr] = stats
        ptr += 1
      }
    }
    pendingQueries.length = ptr
    pendingStats.length = ptr
  }

  return {
    beginQuery: beginQuery,
    endQuery: endQuery,
    update: update,
    getNumPendingQueries: function () {
      return pendingQueries.length
    },
    pushScopeStats: pushScopeStats,
    clear: function () {
      // make sure we destroy all queries.
      for (var i = 0; i < queryPool.length; i++) {
        extTimer.deleteQueryEXT(queryPool[i])
      }
    }
  }
}
