fetch('http://localhost:3005/api/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email:'kwizera@brightschool.edu', password:'Amahoro123'})
}).then(r => r.json()).then(d => console.log(JSON.stringify(d))).catch(e => console.log('ERR:', e.message));
