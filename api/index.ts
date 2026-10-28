import express from 'express';
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const mockUser = {id:'user_123', name:'WANAS User', status:'نشط الآن'};

app.get('/api/health', (req,res)=> res.json({ok:true, message:'WANAS API is running!'}));

app.post('/api/auth/register', (req,res)=>{
  res.json({user:{id:'user_'+Date.now(), name:req.body.name||'WANAS User', email:req.body.email}, token:'test-token'});
});
app.post('/api/auth/login', (req,res)=>{
  res.json({user:mockUser, token:'test-token'});
});

// كل الـ API اللي التطبيق بينده عليها - نرجع داتا فاضية عشان الرسالة الصفراء تختفي
app.get('/api/me', (req,res)=> res.json({user:mockUser}));
app.get('/api/user', (req,res)=> res.json({user:mockUser}));
app.get('/api/feed', (req,res)=> res.json({posts:[], stories:[]}));
app.get('/api/posts', (req,res)=> res.json({posts:[]}));
app.get('/api/stories', (req,res)=> res.json({stories:[]}));
app.get('/api/rooms', (req,res)=> res.json({rooms:[]}));
app.get('/api/audio-rooms', (req,res)=> res.json({rooms:[]}));
app.get('/api/notifications', (req,res)=> res.json({notifications:[]}));
app.get('/api/messages', (req,res)=> res.json({messages:[]}));

// أي رابط تاني تحت /api - رجع ok عشان ميقولش غير متصل
app.all('/api/:path(*)', (req,res)=>{
  res.json({ok:true, data:[], message:'mock data'});
});

app.get('/(.*)', (req,res)=>{
  res.json({ok:true, message:'WANAS API running'});
});

export default app;
