var parseCommit = require('git-parse-commit')
const execSync = require('child_process').execSync
const os = require('os')
var fs = require('fs')
const crypto = require('crypto')

// num commits to collect benchmarking info for.
var numCommits = 5

// parse command line.
var args = process.argv.slice(2)
if (args.length > 0) {
  numCommits = parseInt(args[0])

  if (isNaN(numCommits)) {
    console.log('Command line argument must be an integer.')
    process.exit(1)
  }
}

var quietMode = true

// gather device info.
var deviceInfo = {}
deviceInfo['cpu'] = os.cpus()[0].model
deviceInfo['platform'] = os.platform()
deviceInfo['release'] = os.release()
deviceInfo['arch'] = os.arch()

/*
  We do not allow collecting benchmarking info before this commit.
  Before this commit, the benchmarks were not yet properly set up, so
  they not produce reasonable benchmarking data.
 */
var ancestorCommit = 'e1799c0055b07f3722f8635c2a9bf7759e9d11e8'

// Record original branch name
var originalCommit = execSync('git rev-parse --abbrev-ref HEAD') + ''
console.log('') // insert newline

// get a list of commits, and split them based on the null-character.
var output = execSync('git rev-list HEAD --max-count ' + numCommits + ' --header') + ''
var commits = output.split('\u0000')
commits.splice(-1, 1) // last element is will be an empty string, so remove it.

// First git stash, to make sure that we don't throw away any of the user's changes.
execSync('git stash')

var testResults = []

for (var i = 0; i < commits.length; i++) {
  var commit = parseCommit(commits[i])

  try {
    execSync('git merge-base --is-ancestor ' + ancestorCommit + ' ' + commit.hash)
  } catch (e) {
    console.log('  We reached the ancestor commit ' + ancestorCommit)
    console.log('  Stop collecting data')
    break
  }

  execSync('git checkout ' + commit.hash + (quietMode ? ' -q' : ''))

  try {
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
    console.log('  Collected benchmark results for commit ', commit.hash)
  } catch (e) {
    console.log('  WARNING: could not run benchmarks for commit ', commit.hash)
  }
}

// next we restore to the original commit.
try {
  execSync('git checkout ' + originalCommit)
  execSync('git stash pop')
} catch (e) {}

// create results object, that contains all benchmark results.
var result = {}
result['testResults'] = testResults
result['deviceInfo'] = deviceInfo

// write results object to a file.
// The name of the file is based on a randomly generated ID-value

var jsonStr = JSON.stringify(result)
var id = crypto.randomBytes(10).toString('hex')
var outputFile = 'bench/bench-result-' + id + '.json'

fs.writeFileSync(outputFile, jsonStr)
console.log('  Benchmarking data written to ' + outputFile)
