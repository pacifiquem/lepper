const childProcess = require('child_process');

var firstStdout;
var secondStdout;
var firstStderr;
var secondStderr;

childProcess.exec('git commit -m \" test: testing childprocess if is working \"', (error, stdout, stderr) => {
    firstStderr = stderr;
    firstStdout = stdout;
    if (error) console.log(error);
    else console.log(stdout);
});

childProcess.exec('git push origin main', (err, stdout, stderr) => {
    secondStderr = stderr;
    secondStdout = stdout;
    err ? console.log(err) : console.log(stdout);
});

console.log("========================= outputs ========================");

console.log(firstStdout, firstStderr);
console.log(secondStdout, secondStderr);