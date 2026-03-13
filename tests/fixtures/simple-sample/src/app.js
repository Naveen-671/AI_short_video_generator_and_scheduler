const { handle } = require('./api');

function main() {
  const result = handle({ action: 'greet', name: 'world' });
  console.log(result);
}

main();
