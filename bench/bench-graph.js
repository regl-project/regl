var fs = require('fs')
const execSync = require('child_process').execSync

var jsonFile
// command line parsing.
var args = process.argv.slice(2)
if (args.length > 0) {
  jsonFile = args[0]
} else {
  console.log('Please specify JSON test data.')
  process.exit(1)
}

try {
  var json = fs.readFileSync(jsonFile)
} catch (e) {
  console.log('Could not read json file: ', jsonFile)
}

// create output file name
var i = jsonFile.lastIndexOf('.')
var outputFile
if (i === -1) {
  outputFile = jsonFile + '.html'
} else {
  outputFile = jsonFile.slice(0, -(jsonFile.length - i)) + '.html'
}

fs.writeFileSync(outputFile,
  `
    <!DOCTYPE html>
    <meta charset="utf-8">
    <style>
h1 {
  text-align: left;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 50px;
}

h2 {
  text-align: left;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 30px;
}

p {
  text-align: left;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
}

body {
    margin: 0 auto;
    max-width: 760px;
}

path {
    stroke: steelblue;
    stroke-width: 2;
    fill: none;
}
.axis path,
.axis line {
    fill: none;
    stroke: grey;
    stroke-width: 1;
    shape-rendering: crispEdges;
}

div.tooltip {
    position: absolute;
    text-align: left;
    width: 230px;
    padding: 10px;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #222;

    font-size: 14px;
    background: white;
    border: 2px;
    border-radius: 8px;
    border-style: solid;
  border-color: #000;

}
text {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    fill: #666;
  font-size: 14px;

}
  </style>

  <body>

  <script src="https://d3js.org/d3.v3.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.6.0/moment.min.js"></script>

  <script>
  ` +

`
function createGraph (json) {
  function sigfigs (x) {
    var xr = Math.round(x * 1000)
    return (xr / 1000)
  }
  console.log("josn; ", json)

  // Setup margins.
  var margin = {top: 30, right: 20, bottom: 30, left: 50}
  var width = 660 - margin.left - margin.right
  var height = 297 - margin.top - margin.bottom

  var x = d3.time.scale().range([0, width])
  var y = d3.scale.linear().range([height, 0])

  var xAxis = d3.svg.axis().scale(x)
      .orient('bottom').ticks(5)
  var yAxis = d3.svg.axis().scale(y)
      .orient('left').ticks(5)

  var valueline = d3.svg.line()
      .x(function (d) { return x(d.date) })
      .y(function (d) { return y(d.testData.time.mean) })

  // Define the div for the tooltip
  var div = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0) // initially, the div is invisible.


  // create header.
  var header = document.createElement('h1')
  header.innerHTML = "Benchmark Results"
  document.body.appendChild(header)

  header = document.createElement('h2')
  header.innerHTML = 'Device Info</br> '
  document.body.appendChild(header)

  par = document.createElement('p')
  par.innerHTML =
    '<b>CPU: </b>' + json.deviceInfo.cpu + '</br>' +
    '<b>OS: </b>' + json.deviceInfo.platform + ' ' +
    json.deviceInfo.release + ' ' +
    json.deviceInfo.arch
    '</br>' +

  document.body.appendChild(par)

  Object.keys(json.testResults[0].testData).map(function (testCase) {
    /*if (testCase !== 'cube') {
      return
    }*/
    console.log("test case: ", testCase)

    // create header.
    var header = document.createElement('h2')
    header.innerHTML = 'Test Case: ' + testCase
    document.body.appendChild(header)

    // gather test data for this test case.
    var data = []
    for (var i = 0; i < json.testResults.length; i++) {

      if(json.testResults[i].testData[testCase]) {
        data.push({
          date: new Date(json.testResults[i].timestamp * 1000),
          title: json.testResults[i].title,
          description: json.testResults[i].description,
          hash: json.testResults[i].hash,
          author: json.testResults[i].author,

          testData: json.testResults[i].testData[testCase]
        })
      }
    }

    // add svg canvas.
    var svg = d3.select('body')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform',
              'translate(' + margin.left + ',' + margin.top + ')')

    x.domain(d3.extent(data, function (d) { return d.date }))
    y.domain([0, d3.max(data, function (d) { return d.testData.time.mean })])

    // draw line chart.
    svg.append('path')
      .attr('class', 'line')
      .attr('d', valueline(data))

    // draw data point dots.
    svg.selectAll('dot')
      .data(data)
      .enter()
      .append('a')
      .attr('xlink:href',
            function (d) {
              return 'https://github.com/mikolalysenko/regl/commit/' + d.hash
            })
      .attr('target', '"_blank"')
      .append('circle')

      .attr('r', 3)
      .attr('cx', function (d) { return x(d.date) })
      .attr('cy', function (d) { return y(d.testData.time.mean) })

    // show tooltip on hover.
      .on('mouseover', function (d) {
        div
          .transition()
          .duration(100)
          .style('opacity', 0.9)

        var desc = d.title + d.description
        var shortenedDesc = desc.length > 70 ? desc.substring(0, 69) + '...' : desc
        var commitUrl = 'https://github.com/mikolalysenko/regl/commit/' + d.hash

        var timeDiff = moment(d.date).fromNow()

        console.log('link: ', commitUrl)

        div.html(
          '<table>' +
            '<tbody>' +

          '<tr>' +
            '<td><b>Hash: </b></td>  <td>' + '<code>' + d.hash.substring(0, 7) + '</code>' + '</td>' +
            '</tr>' +

          '<tr>' +
            '<td><b>Desc.: </b></td>  <td>' + shortenedDesc + '</td>' +
            '</tr>' +

          '<tr>' +
            '<td><b>Time: </b></td>  <td>' + sigfigs(d.testData.time.mean) + '∓' + sigfigs(d.testData.time.stddev) + 'ms' + '</td>' +
            '</tr>' +

          '<tr>' +
            '<td><b>Author: </b></td>  <td>' + d.author + '</td>' +
            '</tr>' +

          '<tr>' +
            '<td><b>Date: </b></td>  <td>' + timeDiff + '</td>' +
            '</tr>' +

          '</tbody>' +
            '</table>'
        )
          .style('left', (d3.event.pageX + 10) + 'px')
          .style('top', (d3.event.pageY - 28) + 'px')
      }).on('mouseout',
            function (d) {
              div.transition()
                .duration(100)
                .style('opacity', 0)
            })

    // X-axis
    svg.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(xAxis)
      .append('text')
      .attr('class', 'label')
      .attr('x', width + 20)
      .attr('y', -6)
      .style('text-anchor', 'end')
      .text('Commit Time')

    // Y-axis
    svg.append('g')
      .attr('class', 'y axis')
      .call(yAxis)
      .append('text')
      .attr('class', 'label')
      .attr('y', -20)
      .attr('x', 40)
      .attr('dy', '.7em')
      .style('text-anchor', 'end')
      .text('Runtime(ms)')
  })
}

` + '\n' +
'createGraph(' + json + ')' +
  `
  </script>

  </body>
    `)

// next, we open the output file in the default web browser.
var open
var plat = process.platform
if (plat === 'darwin') {
  open = 'open'
} else if (plat === 'win32' || plat === 'win64') {
  open = 'open'
} else {
  open = 'xdg-open'
}
execSync(open + ' ' + outputFile)
