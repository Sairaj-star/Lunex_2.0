
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "lunex.json");
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 25));
const OWNER_EMAIL = process.env.OWNER_EMAIL || "deshmukhvidyut771@gmail.com";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "Zeus74474@#";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: MAX_UPLOAD_MB * 1024 * 1024,
  cors: { origin: true, credentials: true }
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(ROOT, "public")));

const NAME_RE = /^[A-Za-z ]+$/;
const PHONE_RE = /^\d{10}$/;
const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const cleanName = v => String(v || "").trim().replace(/\s+/g, " ");
const validName = v => NAME_RE.test(v) && v.length >= 2 && v.length <= 60;
const validPhone = v => PHONE_RE.test(String(v || ""));
const validCapacity = v => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 50;
const now = () => new Date().toISOString();
const makeId = p => p + "_" + crypto.randomBytes(12).toString("hex");
const roomNumber = v => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 500 ? Number(v) : null;
const safeEqual = (a,b) => { const x=Buffer.from(String(a||"")), y=Buffer.from(String(b||"")); return x.length===y.length && crypto.timingSafeEqual(x,y); };

function makeKey() {
  let k=""; while(k.length<9) k += KEY_CHARS[crypto.randomInt(KEY_CHARS.length)]; return k;
}
function initialRoom(i) {
  return { number:i, booked:false, booking:null, key:null, capacity:0, occupants:[], messages:[], audit:[],
    invite:null, expiresAt:null, library:[], vault:[], cinema:{url:"",playing:false,position:0,updatedAt:null}, arcade:{cells:["","","","","","","","",""],turn:"X"} };
}
function initialDB() {
  const rooms={}; for(let i=1;i<=500;i++) rooms[i]=initialRoom(i);
<<<<<<< HEAD
  return {version:2,rooms,createdAt:now()};
=======
  return {version:2,rooms,createdAt:now(),otp:{}};
>>>>>>> 7f94ba8377e4642f232352e9fdc1fed3e7449c2d
}
let db;
try { db=fs.existsSync(DB_FILE)?JSON.parse(fs.readFileSync(DB_FILE,"utf8")):initialDB(); }
catch { db=initialDB(); }
for(let i=1;i<=500;i++) if(!db.rooms[i]) db.rooms[i]=initialRoom(i);
<<<<<<< HEAD
=======
if(!db.otp) db.otp={};
>>>>>>> 7f94ba8377e4642f232352e9fdc1fed3e7449c2d
function persist() {
  try { const tmp=DB_FILE+".tmp"; fs.writeFileSync(tmp,JSON.stringify(db)); fs.renameSync(tmp,DB_FILE); } catch(e){ console.error("Persistence error:",e.message); }
}
function audit(room,type,data={}) {
  room.audit.push({id:makeId("audit"),type,at:now(),...data});
  if(room.audit.length>2000) room.audit.splice(0,room.audit.length-2000);
}
function roomPublic(room) {
  return {number:room.number,status:!room.booked?"available":room.occupants.length>=room.capacity?"full":"occupied",
    booked:room.booked,capacity:room.capacity,occupants:room.occupants.length,expiring:!!room.expiresAt};
}
function broadcastRoom(n){io.emit("room:status",roomPublic(db.rooms[n]));}
function broadcastState(n){
  const r=db.rooms[n];
  io.to("room:"+n).emit("room:occupancy",{room:n,capacity:r.capacity,count:r.occupants.length,
    occupants:r.occupants.map(o=>({id:o.id,label:o.label}))});
  broadcastRoom(n);
}
function ownerToken(){
  const p=Buffer.from(JSON.stringify({exp:Date.now()+12*60*60*1000})).toString("base64url");
  const s=crypto.createHmac("sha256",SESSION_SECRET).update(p).digest("base64url"); return p+"."+s;
}
function verifyOwner(token){
  try { const [p,s]=String(token||"").split("."); const e=crypto.createHmac("sha256",SESSION_SECRET).update(p).digest("base64url");
    return !!p&&!!s&&safeEqual(s,e)&&JSON.parse(Buffer.from(p,"base64url")).exp>Date.now(); } catch{return false;}
}
function requireOwner(req,res,next){if(!verifyOwner(req.headers.authorization?.replace(/^Bearer\s+/i,"")))return res.status(401).json({error:"Owner authentication required."});next();}
function roomByKey(n,key){const r=db.rooms[n];return r&&r.booked&&safeEqual(key,r.key)?r:null;}

function encryptNote(text, key) {
  const k=crypto.createHash("sha256").update(String(key)+SESSION_SECRET).digest();
  const iv=crypto.randomBytes(12), c=crypto.createCipheriv("aes-256-gcm",k,iv);
  const enc=Buffer.concat([c.update(String(text),"utf8"),c.final()]);
  return {iv:iv.toString("base64url"),data:enc.toString("base64url"),tag:c.getAuthTag().toString("base64url")};
}
function decryptNote(note,key){
  try { const k=crypto.createHash("sha256").update(String(key)+SESSION_SECRET).digest(), d=crypto.createDecipheriv("aes-256-gcm",k,Buffer.from(note.iv,"base64url"));
    d.setAuthTag(Buffer.from(note.tag,"base64url")); return Buffer.concat([d.update(Buffer.from(note.data,"base64url")),d.final()]).toString("utf8");
  } catch{return null;}
}

app.get("/health",(req,res)=>res.json({ok:true,app:"Lunex 2.0",rooms:500}));
app.get("/api/rooms",(req,res)=>res.json({rooms:Object.values(db.rooms).map(roomPublic)}));

app.post("/api/owner/login",(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
  if(!safeEqual(email,OWNER_EMAIL.trim().toLowerCase())||!safeEqual(password,OWNER_PASSWORD))
    return res.status(401).json({error:"Invalid owner credentials."});
  res.json({token:ownerToken()});
});
app.get("/api/owner/overview",requireOwner,(req,res)=>{
  const rooms=Object.values(db.rooms), occupied=rooms.filter(r=>r.booked).length, full=rooms.filter(r=>r.booked&&r.occupants.length>=r.capacity).length;
  const guests=rooms.reduce((a,r)=>a+r.occupants.length,0);
  const activity=rooms.flatMap(r=>r.audit.map(a=>({...a,room:r.number}))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,150);
  res.json({stats:{total:500,available:500-occupied,occupied,full,guests},activity});
});
app.get("/api/owner/rooms",requireOwner,(req,res)=>{
  res.json({rooms:Object.values(db.rooms).map(r=>({...roomPublic(r),booking:r.booking,
    key:r.key,occupants:r.occupants.map(o=>({id:o.id,label:o.label,joinedAt:o.joinedAt})),audit:r.audit.slice(-300)}))});
});
app.post("/api/rooms/:n/reset",requireOwner,(req,res)=>{
  const n=roomNumber(req.params.n);if(!n)return res.status(400).json({error:"Invalid room."});
  clearRoom(n,"The room was closed by the owner.");res.json({ok:true});
});

app.post("/api/rooms/:n/book",(req,res)=>{
  const n=roomNumber(req.params.n);if(!n)return res.status(400).json({error:"Invalid room."});
  const r=db.rooms[n];
  if(r.booked)return res.status(409).json({error:"This suite is no longer available."});
  const name=cleanName(req.body.name),phone=String(req.body.phone||"").trim(),capacity=Number(req.body.capacity);
  if(!validName(name))return res.status(400).json({error:"Name must contain only letters and spaces."});
  if(!validPhone(phone))return res.status(400).json({error:"Enter a valid 10-digit mobile number."});
  if(!validCapacity(capacity))return res.status(400).json({error:"Capacity must be between 1 and 50."});
  const bookingId=makeId("booking");
  r.booked=true;r.capacity=capacity;r.key=makeKey();r.booking={id:bookingId,name,phone,capacity,bookedAt:now()};
  r.messages=[];r.audit=[];r.expiresAt=req.body.ttlMinutes&&Number(req.body.ttlMinutes)>0?new Date(Date.now()+Math.min(Number(req.body.ttlMinutes),1440)*60000).toISOString():null;
  audit(r,"room_booked",{capacity});persist();broadcastRoom(n);
  res.json({ok:true,room:roomPublic(r),key:r.key,bookingId,expiresAt:r.expiresAt});
});

app.post("/api/invite/create",(req,res)=>{
  const n=roomNumber(req.body.roomNumber),key=String(req.body.key||"");const r=n&&roomByKey(n,key);
  if(!r)return res.status(403).json({error:"Invalid suite key."});
  const minutes=Math.min(Math.max(Number(req.body.minutes||30),5),240),token=crypto.randomBytes(24).toString("base64url");
  r.invite={token,expiresAt:new Date(Date.now()+minutes*60000).toISOString()};persist();
  res.json({token,expiresAt:r.invite.expiresAt});
});
app.get("/api/invite/:token",(req,res)=>{
  const r=Object.values(db.rooms).find(x=>x.invite?.token===req.params.token);
  if(!r||!r.booked||!r.invite||new Date(r.invite.expiresAt)<=new Date())return res.status(404).json({error:"Invitation expired or invalid."});
  res.json({room:r.number,remaining:Math.max(0,r.capacity-r.occupants.length),expiresAt:r.invite.expiresAt});
});

app.get("/api/vault",(req,res)=>{
  const n=roomNumber(req.query.room),r=n&&roomByKey(n,req.query.key);if(!r)return res.status(403).json({error:"Unauthorized suite."});
  res.json({notes:r.vault.map(x=>({id:x.id,at:x.at,text:decryptNote(x,req.query.key)})).filter(x=>x.text!==null)});
});
app.post("/api/vault",(req,res)=>{
  const n=roomNumber(req.body.room),r=n&&roomByKey(n,req.body.key),text=String(req.body.text||"").trim();
  if(!r)return res.status(403).json({error:"Unauthorized suite."});if(!text||text.length>10000)return res.status(400).json({error:"Invalid note."});
  const enc=encryptNote(text,req.body.key);r.vault.push({id:makeId("note"),at:now(),...enc});if(r.vault.length>100)r.vault.shift();persist();res.json({ok:true});
});

app.get("/api/library",(req,res)=>{
  const n=roomNumber(req.query.room),r=n&&roomByKey(n,req.query.key);if(!r)return res.status(403).json({error:"Unauthorized suite."});
  res.json({items:r.library.slice(-100)});
});
app.post("/api/library",(req,res)=>{
  const n=roomNumber(req.body.room),r=n&&roomByKey(n,req.body.key),url=String(req.body.url||"").trim(),title=String(req.body.title||"").trim().slice(0,160);
  if(!r)return res.status(403).json({error:"Unauthorized suite."});
  try{const u=new URL(url);if(!["http:","https:"].includes(u.protocol))throw 0;}catch{return res.status(400).json({error:"Enter a valid http(s) URL."});}
  r.library.push({id:makeId("link"),url,title:title||url,at:now()});if(r.library.length>100)r.library.shift();persist();res.json({ok:true});
});

const allowedMime=new Set(["image/jpeg","image/png","image/gif","image/webp","video/mp4","video/webm","video/quicktime","audio/webm","audio/ogg","audio/mpeg","audio/wav"]);
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UPLOAD_DIR),filename:(req,file,cb)=>cb(null,makeId("media")+path.extname(file.originalname||"").toLowerCase().slice(0,10))});
const upload=multer({storage,limits:{fileSize:MAX_UPLOAD_MB*1024*1024,files:1},fileFilter:(req,file,cb)=>cb(null,allowedMime.has(file.mimetype))});
app.post("/api/upload",upload.single("file"),(req,res)=>{
  const n=roomNumber(req.body.roomNumber),r=n&&roomByKey(n,req.body.key);
  if(!n||!req.file)return res.status(400).json({error:"Invalid upload."});
  if(!r){try{fs.unlinkSync(req.file.path)}catch{};return res.status(403).json({error:"Unauthorized suite."});}
  const type=req.file.mimetype.startsWith("image/")?"image":req.file.mimetype.startsWith("video/")?"video":"audio";
  const msg={id:makeId("msg"),room:n,senderId:null,senderLabel:"Guest",type,url:"/media/"+path.basename(req.file.path),name:req.file.originalname,mime:req.file.mimetype,size:req.file.size,at:now(),edited:false};
  r.messages.push(msg);audit(r,"media_sent",{type});persist();io.to("room:"+n).emit("message:new",msg);res.json({message:msg});
});
app.use("/media",express.static(UPLOAD_DIR,{maxAge:"1h"}));

<<<<<<< HEAD
=======
async function sendTwilioOtp(phone,otp){
  const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_FROM;
  if(!sid||!token||!from)return false;
  const body=new URLSearchParams({From:from,To:"+91"+phone,Body:`Your Lunex verification code is ${otp}. It expires in 5 minutes.`});
  const auth=Buffer.from(`${sid}:${token}`).toString("base64");
  const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"},body});
  return r.ok;
}
app.post("/api/otp/send",async(req,res)=>{
  const phone=String(req.body.phone||"").trim();if(!validPhone(phone))return res.status(400).json({error:"Enter a valid 10-digit phone number."});
  const existing=db.otp[phone];if(existing&&Date.now()-existing.sentAt<60000)return res.status(429).json({error:"Please wait before requesting another OTP."});
  if(!process.env.TWILIO_ACCOUNT_SID||!process.env.TWILIO_AUTH_TOKEN||!process.env.TWILIO_FROM)
    return res.status(503).json({error:"Real SMS OTP is not configured. Add Twilio credentials on Render before enabling verification."});
  const otp=String(crypto.randomInt(100000,1000000)),hash=crypto.createHmac("sha256",SESSION_SECRET).update(phone+":"+otp).digest("hex");
  try{if(!(await sendTwilioOtp(phone,otp)))throw new Error("SMS failed");db.otp[phone]={hash,sentAt:Date.now(),expiresAt:Date.now()+300000,attempts:0};persist();res.json({ok:true,expiresIn:300});}
  catch{res.status(502).json({error:"The SMS provider could not deliver the OTP. Please try again."});}
});
app.post("/api/otp/verify",(req,res)=>{
  const phone=String(req.body.phone||"").trim(),otp=String(req.body.otp||"").trim(),x=db.otp[phone];
  if(!x||x.expiresAt<Date.now())return res.status(400).json({error:"OTP expired. Request a new code."});
  if(x.attempts>=5)return res.status(429).json({error:"Too many attempts. Request a new OTP."});
  x.attempts++;
  const hash=crypto.createHmac("sha256",SESSION_SECRET).update(phone+":"+otp).digest("hex");
  if(!safeEqual(hash,x.hash))return res.status(401).json({error:"Incorrect OTP."});
  delete db.otp[phone];persist();res.json({ok:true,verified:true});
});

>>>>>>> 7f94ba8377e4642f232352e9fdc1fed3e7449c2d
io.on("connection",socket=>{
  socket.on("room:join",({roomNumber:rn,key}={})=>{
    const n=roomNumber(rn);if(!n)return socket.emit("room:error","Invalid suite.");
    const r=db.rooms[n];
    if(!r.booked||!safeEqual(String(key||""),r.key))return socket.emit("room:error","This suite is not booked with this key.");
    if(r.occupants.some(o=>o.id===socket.id))return;
    if(r.occupants.length>=r.capacity)return socket.emit("room:error","This suite is full.");
    const label="Guest "+String(r.occupants.length+1).padStart(2,"0");
    const occupant={id:socket.id,label,joinedAt:now()};
    r.occupants.push(occupant);socket.data.roomNumber=n;socket.data.label=label;socket.join("room:"+n);
    r.messages.push({id:makeId("sys"),room:n,senderId:null,senderLabel:"Lunex Reception",type:"system",text:`${label} entered the suite.`,at:now(),edited:false});
    audit(r,"entered",{label});persist();
    socket.emit("room:joined",{room:roomPublic(r),occupant,messages:r.messages.slice(-500),cinema:r.cinema,arcade:r.arcade});
    io.to("room:"+n).emit("message:new",r.messages.at(-1));broadcastState(n);
  });
  socket.on("message:send",({text}={})=>{
    const n=socket.data.roomNumber,r=n&&db.rooms[n],value=String(text||"").trim();if(!r||!value||value.length>4000)return;
    const recent=r.messages.filter(m=>m.senderId===socket.id&&Date.now()-Date.parse(m.at)<3000);if(recent.length>=8)return socket.emit("room:error","Please slow down.");
    const msg={id:makeId("msg"),room:n,senderId:socket.id,senderLabel:socket.data.label,type:"text",text:value,at:now(),edited:false};
    r.messages.push(msg);audit(r,"message_sent",{messageId:msg.id,senderLabel:socket.data.label});persist();io.to("room:"+n).emit("message:new",msg);
  });
  socket.on("message:edit",({id,text}={})=>{
    const n=socket.data.roomNumber,r=n&&db.rooms[n],m=r?.messages.find(x=>x.id===id),value=String(text||"").trim();
    if(!m||m.senderId!==socket.id||m.type!=="text"||!value||value.length>4000)return;
    m.text=value;m.edited=true;m.editedAt=now();audit(r,"message_edited",{messageId:id,senderLabel:socket.data.label});persist();io.to("room:"+n).emit("message:updated",m);
  });
  socket.on("message:delete",({id}={})=>{
    const n=socket.data.roomNumber,r=n&&db.rooms[n],m=r?.messages.find(x=>x.id===id);if(!m||m.senderId!==socket.id)return;
    m.deleted=true;delete m.text;delete m.url;delete m.name;persist();io.to("room:"+n).emit("message:updated",m);
  });
  socket.on("cinema:sync",({url,playing,position}={})=>{
    const n=socket.data.roomNumber,r=n&&db.rooms[n];if(!r)return;
    if(typeof url==="string"&&url.length<=1500)r.cinema.url=url;r.cinema.playing=!!playing;r.cinema.position=Math.max(0,Number(position)||0);r.cinema.updatedAt=now();
    persist();io.to("room:"+n).emit("cinema:state",r.cinema);
  });
  socket.on("arcade:move",({index,value}={})=>{
    const n=socket.data.roomNumber,r=n&&db.rooms[n];if(!r||!Number.isInteger(index)||index<0||index>8||!["X","O"].includes(value)||r.arcade.cells[index])return;
    if(value!==r.arcade.turn)return;r.arcade.cells[index]=value;r.arcade.turn=value==="X"?"O":"X";persist();io.to("room:"+n).emit("arcade:state",r.arcade);
  });
  socket.on("arcade:reset",()=>{const n=socket.data.roomNumber,r=n&&db.rooms[n];if(!r)return;r.arcade={cells:["","","","","","","","",""],turn:"X"};persist();io.to("room:"+n).emit("arcade:state",r.arcade);});
  socket.on("room:exit",()=>leave("exit"));
  socket.on("disconnect",reason=>leave(reason||"disconnect"));
  function leave(reason){
    const n=socket.data.roomNumber,r=n&&db.rooms[n];if(!r)return;const i=r.occupants.findIndex(o=>o.id===socket.id);if(i<0)return;
    const p=r.occupants[i];r.occupants.splice(i,1);r.messages.push({id:makeId("sys"),room:n,senderId:null,senderLabel:"Lunex Reception",type:"system",text:`${p.label} left the chat.`,at:now(),edited:false});
    audit(r,"exited",{label:p.label,reason});
    socket.data.roomNumber=null;
    if(r.occupants.length===0){clearRoom(n,"The last guest left.");}
    else {persist();io.to("room:"+n).emit("message:new",r.messages.at(-1));broadcastState(n);}
  }
});
function clearRoom(n,reason){
  const r=db.rooms[n];if(!r)return;
  r.booked=false;r.booking=null;r.key=null;r.capacity=0;r.occupants=[];r.messages=[];r.audit=[];r.invite=null;r.expiresAt=null;
  r.library=[];r.vault=[];r.cinema={url:"",playing:false,position:0,updatedAt:null};r.arcade={cells:["","","","","","","","",""],turn:"X"};
  persist();io.to("room:"+n).emit("room:cleared",{room:n,reason});broadcastRoom(n);
}
setInterval(()=>{const t=Date.now();for(let i=1;i<=500;i++){const r=db.rooms[i];if(r.booked&&r.expiresAt&&new Date(r.expiresAt).getTime()<=t)clearRoom(i,"Suite lifetime expired.");}},30000);

app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
server.listen(PORT,"0.0.0.0",()=>console.log(`LUNEX 2.0 running on port ${PORT}`));
