var parseCommit = require('git-parse-commit')

const execSync = require('child_process').execSync
var output = execSync('git rev-list HEAD --max-count 5 --header') + ''
var commits = output.split('\u0000')
commits.splice(-1, 1) // last element is empty, so remove it.

// RECORD ORIGNAL BRANCH NAME
var originalBranch = execSync('git rev-parse --abbrev-ref HEAD') + ''
console.log('branch name:', originalBranch)

// FIRST GIT STASH
execSync('git stash')

var testResults = []

for (var i = 0; i < commits.length; i++) {
  var commit = parseCommit(commits[i])
  //  console.log('code ', i, ':', commit)

  console.log(commit.hash)
  execSync('git checkout ' + commit.hash)

  var json = JSON.parse(execSync('node bench/index.js') + '')
  console.log('json: ', json)

  // CHECKOUT COMMIT
  var obj = {
    hash: commit.hash,
    author: commit.author.name,

    timestamp: commit.author.timestamp,
    title: commit.title,
    description: commit.description,
    testData: json
  }

  testResults.push(obj)

  // RUN TESTS.
}

console.log(JSON.stringify(testResults))

// GO TO ORIGNAL BRANCH
execSync('git checkout ' + originalBranch)

// GIT POP
try {
  execSync('git stash pop')
} catch (e) {}
