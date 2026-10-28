import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
const app = express();
app.use(express.json({limit: '50mb'}));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});
const DATABASE_URL = process.env.DATABASE_URL || '';
let pool: any = null;
function getPool() {
  if (!pool && DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('supabase') ? {rejectUnauthorized:false} : undefined
    });
  }
  return pool;
}
async function initDb() {
  const p = getPool();
  if (!p) return;
  await p.query(`create table if not exists wanas_users (id text primary key, owner text, ts bigint, data jsonb); create table if not exists wanas_credentials (user_id text primary key, email text unique, phone text unique, password_hash text not null);`);
}
let inited = false;
async function ensureInit() {
  if (!inited) { await initDb(); inited = true; }
}
function signToken(payload:any){ return jwt.sign(payload, process.env.JWT_SECRET || 'wanas-secret-key-2024', {expiresIn:'30d'}); }
app.post('/api/auth/register', async (req,res)=>{
  await ensureInit();
  try {
    const {email, phone, password, name, handle} = req.body;
    if (!password || password.length < 6) return res.status(400).json({error:'weak_password'});
    const p = getPool();
    const existing = await p.query('select * from wanas_credentials where email=$1 or phone=$2 limit 1', [email||null, phone||null]);
    if (existing.rows.length) return res.status(409).json({error:'account_exists'});
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const hash = await bcrypt.hash(password, 10);
    const newUser = {id:userId, name:name||handle||'WANAS User', handle:handle||`user_${userId.slice(-6)}`, email:email||null, phone:phone||null, avatar:'', cover:'royal_majlis', bio:'', country:'مصر', city:'القاهرة', verified:false, createdAt:Date.now()};
    await p.query('insert into wanas_users (id, ts, data) values ($1,$2,$3)', [userId, Date.now(), JSON.stringify(newUser)]);
    await p.query('insert into wanas_credentials (user_id, email, phone, password_hash) values ($1,$2,$3,$4)', [userId, email||null, phone||null, hash]);
    const token = signToken({userId});
    res.json({user:newUser, token});
  } catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});
app.post('/api/auth/login', async (req,res)=>{
  await ensureInit();
  try {
    const {email, phone, password} = req.body;
    const p = getPool();
    const r = await p.query('select * from wanas_credentials where email=$1 or phone=$2 limit 1', [email||null, phone||null]);
    if (!r.rows.length) return res.status(401).json({error:'invalid_credentials'});
    const cred = r.rows[0];
    const ok = await bcrypt.compare(password, cred.password_hash);
    if (!ok) return res.status(401).json({error:'invalid_credentials'});
    const ur = await p.query('select data from wanas_users where id=$1', [cred.user_id]);
    const user = ur.rows.length ? ur.rows[0].data : {id:cred.user_id, name:'WANAS User'};
    const token = signToken({userId:cred.user_id});
    res.json({user, token});
  } catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});
app.get('/api/health', async (req,res)=>{ await ensureInit(); res.json({ok:true}); });
app.get('/(.*)', (req,res)=>{ res.json({message:'WANAS API running'}); });
export default app;
