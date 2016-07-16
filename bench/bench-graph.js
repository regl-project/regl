document.write(
  `
    <!DOCTYPE html>
    <meta charset="utf-8">
    <style>
h1 {
  text-align: center;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 50px;

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
  <script src="http://momentjs.com/downloads/moment.min.js"></script>

  <script src="bench/create-graph.js"></script>
  </body>
    `)
