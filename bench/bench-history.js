var parseCommit = require('git-parse-commit')
const execSync = require('child_process').execSync
const os = require('os')

// gather device info.
var deviceInfo
deviceInfo += 'CPU Model: ' + os.cpus()[0].model + '\n'
deviceInfo += 'OS: ' + os.platform() + ' ' + os.release() + ' ' + os.arch() + '\n'

// Record original branch name
var originalBranch = execSync('git rev-parse --abbrev-ref HEAD') + ''
console.log('Original branch name:', originalBranch)

// get a list of commits, and split them based on the null-character.
var output = execSync('git rev-list HEAD --max-count 5 --header') + ''
var commits = output.split('\u0000')
commits.splice(-1, 1) // last element is empty, so remove it.

// First git stash
execSync('git stash')

var testResults = []

for (var i = 0; i < commits.length; i++) {
  var commit = parseCommit(commits[i])

  console.log(commit.hash)
  execSync('git checkout ' + commit.hash)

  // run benchmark. The results of the benchmark script is sent to stdout as json.
  var json = JSON.parse(execSync('node bench/bench.js') + '')

  var obj = {
    hash: commit.hash,
    author: commit.author.name,
    timestamp: commit.author.timestamp,
    title: commit.title,
    description: commit.description,
    testData: json
  }

  testResults.push(obj)
}

// next we restore to the original commit.
try {
  execSync('git checkout ' + originalBranch)
  execSync('git stash pop')
} catch (e) {}

// now print results to stdout.
var result = {}
result['testResults'] = testResults
result['deviceInfo'] = deviceInfo
console.log(JSON.stringify(testResults))
