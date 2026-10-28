import express from 'express';
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.get('/api/health', (req,res)=>{
  res.json({ok:true, message:'WANAS API is running!'});
});

app.post('/api/auth/register', (req,res)=>{
  const {email, phone, name} = req.body;
  const user = {id:'user_'+Date.now(), name:name||'WANAS User', email:email||null, phone:phone||null};
  res.json({user, token:'test-token-123'});
});

app.post('/api/auth/login', (req,res)=>{
  const {email, phone} = req.body;
  const user = {id:'user_123', name:'WANAS User', email:email||null, phone:phone||null};
  res.json({user, token:'test-token-123'});
});

app.get('/(.*)', (req,res)=>{
  res.json({message:'WANAS API running', path:req.path});
});

export default app;
