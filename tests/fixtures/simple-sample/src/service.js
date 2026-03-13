function doThing(action, name) {
  if (action === 'greet') {
    return `Hello, ${name}!`;
  }
  return `Unknown action: ${action}`;
}

module.exports = { doThing };
