
module.exports = function (gl, extensions) {

  var extTimer = extensions.ext_disjoint_timer_query

  if (!extTimer) {
    return null
  }

//  if (extTimer) {
      // FIXME: destroy these two queries somewhere.
 /*   stats._queries = []
    stats._queries[0] = ext_timer.createQueryEXT()
    stats._queries[1] = ext_timer.createQueryEXT()

    stats.iQuery = 0
    stats.iCollect = -1*/
  //  }

  var iQuery = -1
  var iCollect = -2

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

 //   console.log('BEG IS CALLED')

    activeQuery = allocQuery()
//    console.log("activeQuery: ", activeQuery)
    extTimer.beginQueryEXT(extTimer.TIME_ELAPSED_EXT, activeQuery)

    //console.log("begin: ", stats )
  }

  function endQuery () {
    extTimer.endQueryEXT(extTimer.TIME_ELAPSED_EXT)
//    console.log('END IS CALLED')

    activeStats._startQueryIndex = pendingQueries.length
    activeStats._endQueryIndex = activeStats._startQueryIndex


    pendingQueries.push(activeQuery)

 //   console.log("active: ", )
    // start and end specify an inclusive range.

    pendingStats.push(activeStats)

  }

  function update () {

    if (pendingQueries.length == 0) { // for first frame do nothing.
      return
    }

  //  console.log('UPDATE TIMER: ', pendingQueries.length)

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

//    console.log("pending: ",pendingStats.length)

    for (i = 0; i < pendingStats.length; i++) {
      var stats = pendingStats[i]
      for (j = stats._startQueryIndex; j <= stats._endQueryIndex; j++) {
        stats.gpuTime += results[j]
      //  console.log("gpu: ", stats.gpuTime)
      }
    }

    pendingStats = []



  //  console.log("pool: ",  queryPool.length )

    /*
    iQuery++
    iCollect++

    if(iCollect >= 0) { // collect.

      here we increment
    }

    queries[iQuery] = []
    */
  }

  return {
    //  enqueueQuery: enqueueQuery
    beginQuery: beginQuery,
    endQuery: endQuery,
    update: update
  }
}
