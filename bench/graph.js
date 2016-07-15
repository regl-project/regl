/* globals performance */

document.write(
  `
    <!DOCTYPE html>
    <meta charset="utf-8">
    <style>


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
    text-align: center;
    width: 60px;
    height: 28px;
    padding: 2px;
    font: 12px sans-serif;
    background: lightsteelblue;
    border: 0px;
    border-radius: 8px;
    pointer-events: none;
}

  </style>
    <body>

    <script src="bench/d3.v3.min.js"></script>

    <script>

  // Set the dimensions of the canvas / graph
  var margin = {top: 30, right: 20, bottom: 30, left: 50},
  width = 600 - margin.left - margin.right,
  height = 270 - margin.top - margin.bottom;

  // Parse the date / time
  var parseDate = d3.time.format("%d-%b-%y").parse;

  // Set the ranges
  var x = d3.time.scale().range([0, width]);
  var y = d3.scale.linear().range([height, 0]);

  // Define the axes
  var xAxis = d3.svg.axis().scale(x)
      .orient("bottom").ticks(5);

  var yAxis = d3.svg.axis().scale(y)
      .orient("left").ticks(5);

  // Define the line
  var valueline = d3.svg.line()
      .x(function(d) { return x(d.date); })
      .y(function(d) { return y(d.testData.time.mean); });

// Define the div for the tooltip
var div = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  var req = new XMLHttpRequest();
  req.open("GET", 'bench/test_data.json', true);
  req.onreadystatechange = function ()
  {
    if(req.readyState === 4 && (req.status === 200 || req.status == 0))
    {
      var json = JSON.parse(req.responseText)

      Object.keys(json[0].testData).map(function (testCase) {
        //               console.log('testCase: ', testCase)

        var header = document.createElement('h1')
        header.innerHTML = testCase

        document.body.appendChild(header)

      })


      var data = []

      for (var i = 0; i < json.length; i++) {
        data.push({
          date: new Date(json[i].timestamp*1000),
          close: json[i].testData.cube.time.mean,
          testData: json[i].testData.cube
        })

        console.log("d, ", json[i].testData.cube.time.mean)


      }

      // Adds the svg canvas
      var svg = d3.select("body")
          .append("svg")
          .attr("width", width + margin.left + margin.right)
          .attr("height", height + margin.top + margin.bottom)
          .append("g")
          .attr("transform",
                "translate(" + margin.left + "," + margin.top + ")");

      // Scale the range of the data
      x.domain(d3.extent(data, function(d) { return d.date; }));
      y.domain([0, d3.max(data, function(d) { return d.testData.time.mean; })]);

      // Add the valueline path.
      svg.append("path")
        .attr("class", "line")
        .attr("d", valueline(data));


      svg.selectAll("dot")
	.data(data)
	.enter().append("circle")
	.attr("r", 2)
	.attr("cx", function(d) { return x(d.date); })
	.attr("cy", function(d) { return y(d.testData.time.mean); })
        .on("mouseover", function(d) {
            div.transition()
                .duration(200)
                .style("opacity", .9);
            div	.html("loltime" + "<br/>"  + d.testData.time.mean )
                .style("left", (d3.event.pageX) + "px")
                .style("top", (d3.event.pageY - 28) + "px");
            })



      // Add the X Axis
      svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

      // Add the Y Axis
      svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);
    }
  }
  req.send(null);


  </script>
    </body>
    `);
