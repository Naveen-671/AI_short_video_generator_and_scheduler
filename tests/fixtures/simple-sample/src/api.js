const { doThing } = require('./service');

function handle(request) {
  return doThing(request.action, request.name);
}

module.exports = { handle };
