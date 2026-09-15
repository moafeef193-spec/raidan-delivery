const CONFIG={SUPABASE_URL:"https://fkhwohfmwbvztwgarngj.supabase.co",SUPABASE_ANON_KEY:"sb_publishable_QGcSfYZLF1z_VY4mbpHOJQ_8_F-qaP5"};
let sb=null, drivers=[], orders=[];
const seed=["شاهد","نعيم","ارشد","صمد","منور علي","شهزاد","Anam","Naeem UD","اديب"];

function ready(){return CONFIG.SUPABASE_URL.startsWith("http") && !CONFIG.SUPABASE_URL.includes("YOUR_")}
async function init(){
  if(ready()){sb=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY); await loadData(); subscribe();}
  else {drivers=seed.map((name,i)=>({id:i+1,name,status:"available",priority:i+1}));orders=[];render();}
}
async function loadData(){
  const d=await sb.from("drivers").select("*").order("priority");
  const o=await sb.from("delivery_orders").select("*").order("created_at",{ascending:false});
  if(!d.error) drivers=d.data||[]; if(!o.error) orders=o.data||[]; render();
}
function subscribe(){
 sb.channel("raidan-live").on("postgres_changes",{event:"*",schema:"public",table:"drivers"},loadData)
 .on("postgres_changes",{event:"*",schema:"public",table:"delivery_orders"},loadData).subscribe();
}
const now=()=>new Date().toISOString();
async function startDelivery(id){
 const input=document.querySelector(`#driver-${id} input`);
 const n=(input?.value||"").trim(); if(!n)return alert("أدخل رقم الطلب أولاً");
 const d=drivers.find(x=>String(x.id)===String(id)); if(!d)return;
 if(sb){
   await sb.from("delivery_orders").insert({driver_id:d.id,driver_name:d.name,order_number:n,status:"out",departed_at:now()});
   await sb.from("drivers").update({status:"out"}).eq("id",d.id);
 }else{orders.push({id:Date.now(),driver_id:d.id,driver_name:d.name,order_number:n,status:"out",departed_at:now()});d.status="out";}
 input.value=""; render();
}
async function returnOrder(orderId){
 const o=orders.find(x=>String(x.id)===String(orderId)); if(!o)return;
 if(sb){
   await sb.from("delivery_orders").update({status:"returned",returned_at:now()}).eq("id",o.id);
   const still=orders.filter(x=>String(x.driver_id)===String(o.driver_id)&&x.status==="out"&&String(x.id)!==String(o.id)).length;
   if(!still) await sb.from("drivers").update({status:"available"}).eq("id",o.driver_id);
 }else{
   o.status="returned";o.returned_at=now();
   if(!orders.some(x=>String(x.driver_id)===String(o.driver_id)&&x.status==="out"))drivers.find(x=>x.id===o.driver_id).status="available";
 }
 render();
}
async function addDriver(){
 const el=document.getElementById("newDriver"),name=el.value.trim();if(!name)return;
 if(sb){await sb.from("drivers").insert({name,status:"available",priority:drivers.length+1});await loadData();}
 else{drivers.push({id:Date.now(),name,status:"available",priority:drivers.length+1});render();}
 el.value="";
}
function fmt(x){return x?new Date(x).toLocaleTimeString("ar-AE",{hour:"2-digit",minute:"2-digit"}):"—"}
function render(){
 const dc=document.getElementById("drivers"); if(dc)dc.innerHTML=drivers.map(d=>{
  const active=orders.filter(o=>String(o.driver_id)===String(d.id)&&o.status==="out");
  return `<div class="driver"><h3>${esc(d.name)}</h3><div class="status ${active.length?"busy":"available"}">${active.length?"🔴 خارج للتوصيل":"🟢 متاح"} · ${active.length} طلب</div>
  <div id="driver-${d.id}"><input placeholder="رقم الطلب"><button class="gold" onclick="startDelivery('${d.id}')">🛵 بدء التوصيل</button></div>
  ${active.length?`<div style="margin-top:10px">الطلبات: ${active.map(o=>"#"+esc(o.order_number)).join(" ، ")}</div>`:""}</div>`
 }).join("");
 const p=document.getElementById("priority");if(p)p.innerHTML=drivers.filter(d=>d.status==="available").sort((a,b)=>(a.priority||0)-(b.priority||0)).map((d,i)=>`<span>${i+1}️⃣ ${esc(d.name)}</span>`).join("")||"<span>لا يوجد دلفري متاح حالياً</span>";
 const act=document.getElementById("activeOrders");if(act)act.innerHTML=orders.filter(o=>o.status==="out").map(o=>`<div class="order"><b>${esc(o.driver_name)}</b><br>رقم الطلب: <b>#${esc(o.order_number)}</b><br>الخروج: ${fmt(o.departed_at)}<br><button onclick="returnOrder('${o.id}')">🔙 تسجيل الرجوع</button></div>`).join("")||"<div>لا توجد طلبات جاري توصيلها.</div>";
 const ac=drivers.filter(d=>!orders.some(o=>String(o.driver_id)===String(d.id)&&o.status==="out")).length;
 document.getElementById("availableCount")?.replaceChildren(ac);document.getElementById("outCount")?.replaceChildren(drivers.length-ac);document.getElementById("ordersCount")?.replaceChildren(orders.filter(o=>o.status==="out").length);
}
function loadAdmin(){render();const h=document.getElementById("history");if(h)h.innerHTML=orders.map(o=>`<tr><td>${esc(o.driver_name)}</td><td>#${esc(o.order_number)}</td><td>${fmt(o.departed_at)}</td><td>${fmt(o.returned_at)}</td><td>${o.status==="out"?"جاري":"تم الرجوع"}</td></tr>`).join("")}
function endShift(){window.open("admin.html","_blank");setTimeout(()=>window.print(),300)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
setInterval(()=>{const e=document.getElementById("dateTime");if(e)e.textContent=new Date().toLocaleString("ar-AE");},1000);
document.addEventListener("DOMContentLoaded",init);
