const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({id:138, role:'alumni'}, process.env.JWT_SECRET, {expiresIn:'7d'});
console.log(token);
