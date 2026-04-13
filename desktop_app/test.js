console.log('Starting...');
const { app } = require('electron');
console.log('App:', app);
console.log('Ready:', app.whenReady);
app.whenReady().then(() => {
  console.log('App ready!');
  app.quit();
});