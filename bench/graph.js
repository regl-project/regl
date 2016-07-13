/* globals performance */

document.write(`
<!DOCTYPE html>
<meta charset="utf-8">
<style> /* set the CSS */

body { font: 12px Arial;}

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

</style>
<body>

<!-- load the d3.js library -->
<script src="http://d3js.org/d3.v3.min.js"></script>

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
    .y(function(d) { return y(d.close); });

// Adds the svg canvas
var svg = d3.select("body")
    .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform",
              "translate(" + margin.left + "," + margin.top + ")");

// Get the data
d3.csv("bench/data.csv", function(error, data) {
    data.forEach(function(d) {
        d.date = parseDate(d.date);
        d.close = +d.close;
    });

    // Scale the range of the data
    x.domain(d3.extent(data, function(d) { return d.date; }));
    y.domain([0, d3.max(data, function(d) { return d.close; })]);

    // Add the valueline path.
    svg.append("path")
        .attr("class", "line")
        .attr("d", valueline(data));

    // Add the X Axis
    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    // Add the Y Axis
    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

});

</script>
</body>
               `);
/*
json = [
        {hash: '7ff01291646f7f1e786be01320bdc3d6c5711685',x: 1468306886, y: 20},
{hash: '1b5fdeb4da6e3d5363ace0e0a3eff5829f787090',x: 1468306843, y: 29},
{hash: 'fa5fafc28dd55b4383d336323f1a72a71bef340d',x: 1468306656, y: 14},
{hash: '0f44c916c85d430a2d22eeb940d8c942cf06cea3',x: 1468305815, y: 27},
{hash: '792834841f3a6fdef6a8fb60a861d13dc5a0dcb9',x: 1468299161, y: 9},
{hash: '9942a2192dd6830cac8e2653db83e92e78dd6779',x: 1468298252, y: 13},
{hash: '687c9c80bda978b00a4aba7582c95ceb2f7c3b85',x: 1468298078, y: 19},
{hash: '8f067f45cca35229c15f0e491bdef96df0089912',x: 1468265768, y: 30},
{hash: '087b49c4d76d3e7dcf5c8a5abfbf59683494db8f',x: 1468265504, y: 34},
{hash: 'c329a9b13bfc05e8b8253472e4d1d006f3901dc6',x: 1468252461, y: 12},
{hash: 'e76e42bc5a2a5e6aa658662394bb30d7c1f4589f',x: 1468227173, y: 24},
{hash: '2144801a14aed9be2ae7aedb308009818f96c474',x: 1468226988, y: 15},
{hash: '5c59b20aef1287f3e6fd071f72832df91414a0f1',x: 1468226826, y: 19},
{hash: '4284e0941def480aed6d390184c5ac23c4fe8170',x: 1468226732, y: 27},
{hash: '7903f4e97baa9c091b7ae954a5f28e5ecc28fcb6',x: 1468226598, y: 20},
{hash: 'a1495f1556f9bd06da34c9ec4ad96f24b883fb9a',x: 1468226445, y: 16},
{hash: '072c3b2281a49471941a77fde3fdf131fa314457',x: 1468225426, y: 19},
{hash: '29ad956dccd270431759827527a898216e84ef69',x: 1468225058, y: 30},
{hash: 'a22c5dfcfd41db2e4caf584532be88f13df2f9ae',x: 1468224507, y: 32},
{hash: 'da93592d9cb640612e879f5ef3bf1bee13c29ae4',x: 1468224156, y: 27},
{hash: '213808e93e02f3ccb552e09105947721beedf4df',x: 1468222199, y: 21},
{hash: '380caa2b37eaee0920acd168ce6517204ec6529d',x: 1468174304, y: 16},
{hash: 'ed2128b9f8d8a248bb2af798c0f6648ff45b27d5',x: 1468174162, y: 19},
{hash: 'be7735d4a9a30abfc9d2725174b671ed2dd67073',x: 1468174074, y: 17},
{hash: '699b4bc6b17de1698c5582d037dd139766a2d923',x: 1468173901, y: 23},
{hash: 'ef7d57724f29ff71621efe3dca433c9d180939d3',x: 1468159421, y: 26},
{hash: '524db4ec9cfbf6ca707b17dd098a70f858343ddf',x: 1468158975, y: 29},
{hash: '51f55c23af760fff66b616107bd45bcdeabf7eb9',x: 1468158601, y: 23},
{hash: '12a5ee10c3294bfde7e8118020a44b16b94504e1',x: 1468157892, y: 26},
{hash: 'f8d3b9a786adb19cffd4858b81c0ec2e131c1348',x: 1468154467, y: 19}
]
*/
