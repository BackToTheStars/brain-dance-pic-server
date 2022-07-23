const  { getToken } = require('../lib/game');

console.log( getToken("12345", "upload", new Date().getTime() + 5 * 60 * 1000, "abc") )