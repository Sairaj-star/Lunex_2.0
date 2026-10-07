
const socket=io(), modal=document.getElementById("modal"), box=document.getElementById("modalBox");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function close(){modal.classList.add("hidden")} function open(h){box.innerHTML=h;modal.classList.remove("hidden")}
document.querySelector(".backdrop").onclick=close;
document.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>document.getElementById(x.dataset.go)?.scrollIntoView({behavior:"smooth"}));
document.getElementById("night").onclick=()=>document.body.classList.toggle("after-dark");
document.getElementById("enter").onclick=document.getElementById("enter2").onclick=()=>document.getElementById("suites").scrollIntoView({behavior:"smooth"});
document.getElementById("privacy").onclick=()=>open(`<span class="eyebrow">PRIVACY</span><h2>Private by architecture.</h2><p>Normal guests are represented by anonymous labels. Phone numbers and emails are not broadcast to other guests. Suite keys are checked server-side and private media is scoped to the suite.</p><button class="primary wide" onclick="document.getElementById('modal').classList.add('hidden')">Close</button>`);

async function loadRooms(){
 try{const r=await fetch("/api/rooms"),d=await r.json(),el=document.getElementById("rooms");el.innerHTML="";
 d.rooms.forEach(x=>{const b=document.createElement("button");b.className=`room-tile ${x.status}`;b.disabled=x.status!=="available";b.innerHTML=`<span class="num">#${String(x.number).padStart(3,"0")}</span><small>${x.status==="available"?"AVAILABLE":x.status==="full"?"FULL":"OCCUPIED"} · ${x.occupants}/${x.capacity||"—"}</small>`;if(!b.disabled)b.onclick=()=>book(x.number);el.appendChild(b)});
 }catch{document.getElementById("rooms").innerHTML="<p class='error'>Unable to load the live floor.</p>"}
}
socket.on("room:status",loadRooms);loadRooms();

async function book(n){
open(`<span class="eyebrow">SUITE #${n}</span><h2>Reserve your private suite.</h2><p>Your phone is private. It is not shown to other guests.</p>
<form id="book" class="form"><label>Name<input name="name" pattern="[A-Za-z ]+" required placeholder="Letters and spaces only"></label><label>Phone<input name="phone" inputmode="numeric" maxlength="10" required placeholder="10-digit mobile number"></label><label>People<input name="capacity" type="number" min="1" max="50" value="2" required></label><label>Lifetime<select name="ttlMinutes"><option value="0">Until the last guest leaves</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="180">3 hours</option></select></label><button class="primary">Book Suite</button><div id="bookError" class="error"></div></form>`);
document.getElementById("book").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),b=e.target.querySelector("button");b.disabled=true;const r=await fetch(`/api/rooms/${n}/book`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(f))}),d=await r.json();if(!r.ok){document.getElementById("bookError").textContent=d.error;b.disabled=false;return}
sessionStorage.setItem("lunexBooking",JSON.stringify({room:n,key:d.key,bookingId:d.bookingId}));
open(`<span class="eyebrow">BOOKING CONFIRMED</span><h2>Your suite is ready.</h2><p>Suite #${n} is now booked by you. The same server state is broadcast to every connected client.</p><div class="key-box">${esc(d.key)}</div><p>Keep this key private.</p><button class="primary wide" onclick="location.href='/room.html?room=${n}&key=${encodeURIComponent(d.key)}'">Enter Suite</button>`);loadRooms();
};
}
