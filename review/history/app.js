"use strict";
const $ = id => document.getElementById(id);
const S = {index:null, case:null, key:null, step:0, maps:{}, timer:null, mapView:null, floor:0, token:0};
const names = {bed:"床",chair:"椅子",plant:"植物",sofa:"沙发",toilet:"马桶",tv_monitor:"电视 / 显示器",bedframe:"床架",carpet:"地毯",dishwasher:"洗碗机",flowerpot:"花盆",picture:"装饰画",mirror:"镜子"};
const patterns = {pending_analysis:"失败模式待分析",final_within_1m:"终点不足严格精度",final_over_1m:"终点超过 1m",passed_at_observed_pose_then_left:"观测时已达标后离开",passed_only_at_intermediate_positions:"仅运动中经过达标位置",final_within_1m_never_strict:"终点不足严格精度",never_strict_and_final_over_1m:"未达标且终点超过 1m",success:"评分成功"};
const ds = r => r.group.startsWith("ovon") ? "OVON" : "HM3Dv2";
const ex = r => r.group.endsWith("_geo") ? "Geo" : "Learned";
const fmt = (x,n=2) => Number.isFinite(x) ? x.toFixed(n) : "—";
const mediaURL = im => im.url || `media/${im.asset}`;
function text(id,value){$(id).textContent=value;}
function element(tag,cls,value){const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e;}
function stop(){if(S.timer)clearInterval(S.timer);S.timer=null;text("play","播放");}
function distance(i){const d=S.case.geometry?.event_distances?.[String(i)];return Number.isFinite(d)?d:null;}
function summaryNotice(r){
 if(r.paper_credit)return "论文指定不可达任务：评分按论文规则赠分；该成功标记不表示导航实际到达目标。";
 let value=patterns[r.failure_partition]||"历史评测记录";
 if(r.failure_partition==="passed_at_observed_pose_then_left")value+="。点击“首次达标观测”，检查当时的四向图像和之后的选点。";
 if(r.failure_partition==="passed_only_at_intermediate_positions")value+="。保存的中间位置满足判据，返回图像的位置没有满足。";
 if(!r.strict_success&&r.claim==="achieved")value+=" 模型自报完成，与独立评分不一致。";
 return value;
}
function filtered(){
 const query=$("search").value.trim().toLowerCase(),dataset=$("dataset").value,executor=$("executor").value,outcome=$("outcome").value,pattern=$("pattern").value;
 return S.index.cases.filter(r=> (!dataset||ds(r)===dataset)&&(!executor||ex(r)===executor)&&(!query||[r.task_id,r.category,r.scene,names[r.category]||""].join(" ").toLowerCase().includes(query))&&(!outcome||(outcome==="pass"&&r.strict_success)||(outcome==="fail"&&!r.strict_success)||(outcome==="claim"&&!r.strict_success&&r.claim==="achieved"))&&(!pattern||(pattern==="observed"&&r.failure_partition==="passed_at_observed_pose_then_left")||(pattern==="transit"&&r.failure_partition==="passed_only_at_intermediate_positions")||(pattern==="precision"&&["final_within_1m_never_strict","final_within_1m"].includes(r.failure_partition))||(pattern==="far"&&["never_strict_and_final_over_1m","final_over_1m"].includes(r.failure_partition))));
}
function renderList(){
 const rows=filtered(),list=$("caseList");list.replaceChildren();text("count",`${rows.length} / ${S.index.cases.length}`);
 for(const r of rows){
  const b=element("button","case-item"+(r.key===S.key?" selected":""));b.dataset.key=r.key;b.setAttribute("role","listitem");
  const row=element("div","row"),target=element("span","target",`${r.category}`),badge=element("span","sub");badge.append(element("span","dot"+(!r.strict_success?" fail":"")),document.createTextNode(`${fmt(r.dtg_geodesic_m)}m`));row.append(target,badge);
  b.append(row,element("div","sub",`${ds(r)} · ${ex(r)} · ${r.scene}`),element("div","sub",r.task_id));
  if(!r.strict_success)b.append(element("div","tag",patterns[r.failure_partition]||"失败"));
  b.onclick=()=>loadCase(r.key);list.append(b);
 }
 if(!rows.length)list.append(element("div","empty-list","没有符合筛选条件的记录"));
}
async function loadCase(key){
 stop();const token=++S.token;const loading=$("loading");loading.hidden=false;text("loading","正在读取该 episode…");$("content").hidden=true;
 try{
  let c=await loadPortableCase(key);
  if(token!==S.token)return;S.case=c;S.key=key;S.step=0;S.floor=0;S.mapView=null;location.hash=encodeURIComponent(key);
  const r=c.summary;text("datasetLabel",`${ds(r)} / ${ex(r)} EXECUTOR · ${r.scene}`);text("targetTitle",`${r.category}${names[r.category]?" · "+names[r.category]:""}`);text("episodeId",r.task_id);
  text("scoreBadge",r.paper_credit?"论文赠分":r.strict_success?"评分成功":"评分失败");$("scoreBadge").className="score-badge"+(!r.strict_success?" fail":"");
  text("finalDistance",fmt(r.dtg_geodesic_m)+" m");text("claim",r.claim||"未记录");$("claim").className=!r.strict_success&&r.claim==="achieved"?"warn":"";
  text("pathLength",fmt(r.path_length_m,1)+" m");text("stepsTotal",r.episode_steps??"—");text("duration",fmt(r.duration_s/60,1)+" 分钟");
  text("notice",summaryNotice(r));$("notice").className="notice"+(r.strict_success?" info":"");text("thresholdLabel",`严格 < ${r.threshold_m.toFixed(2)}m`);
  $("stepSlider").max=c.events.length-1;
  text("whitelist",c.tool_whitelist.join("\n"));text("promptText",c.prompt);
  const skills=$("skillSelect");skills.replaceChildren();for(let i=0;i<c.skills.length;i++){const o=element("option","",c.skills[i].name);o.value=i;skills.append(o);}showSkill();
  text("skillReads",(c.skill_reads||[]).map(v=>`${v.after_event_index<0?"初始化前":"工具返回 #"+(v.after_event_index+1)+" 后"}\n${v.command}\n退出码：${v.exit_code}`).join("\n\n")||"该次 canonical 未保留 shell 读取记录。");
  text("caseDetails",JSON.stringify({instruction:c.instruction,independent_score:r,parameters:c.parameters,goal_objects:c.geometry?.objects,goal_viewpoints_full:c.geometry?.full_goal_viewpoint_count,goal_viewpoints_displayed:c.geometry?.display_goal_viewpoint_count},null,2));
  $("compareVersion").disabled=!r.group.startsWith("ovon");const other=counterpart();$("compare").disabled=!other;$("export").hidden=!!window.OFFLINE_REVIEW;
  const levels=S.maps[r.scene]||[];$("floorSelect").replaceChildren();levels.forEach((level,i)=>{const o=element("option","",`切片 y=${level.height.toFixed(1)}m`);o.value=i;$("floorSelect").append(o);});
  $("floorSelect").disabled=levels.length===0;
  loading.hidden=true;$("content").hidden=false;renderList();setStep(0);
 }catch(e){if(token===S.token){loading.hidden=false;text("loading",`${e.message}。请启动 README 中的本地回放服务；离线文件可直接打开。`);}}
}
function counterpart(){if(!S.case)return null;const r=S.case.summary,group=r.group.replace(/_(geo|learned)$/,"_"+(ex(r)==="Geo"?"learned":"geo"));return S.index.cases.find(x=>x.group===group&&x.task_id===r.task_id);}
function showSkill(){const skill=S.case?.skills?.[Number($("skillSelect").value)||0];text("skillText",skill?.text||"未找到 Skill 快照");text("skillHash",skill?`SHA-256 ${skill.sha256}`:"");}
function marker(wrap,point,view){if(!point||point.view!==view)return;const mark=element("span","marker");mark.style.left=(point.point[0]*100)+"%";mark.style.top=(point.point[1]*100)+"%";wrap.append(mark,element("span","marker-label",`下一步 #${point.next_seq??"?"} 选点`));}
function imageWrap(im,point){const wrap=element("div","image-wrap"),img=element("img");img.src=mediaURL(im);img.alt=`${im.view} RGB`;img.loading="eager";img.onerror=()=>{img.hidden=true;if(!wrap.querySelector(".missing"))wrap.append(element("div","missing","历史图像不可用"));};wrap.append(img);marker(wrap,point,im.view);return wrap;}
function setStep(index){
 if(!S.case)return;S.step=Math.max(0,Math.min(S.case.events.length-1,index));const e=S.case.events[S.step];$("stepSlider").value=S.step;text("stepLabel",`${S.step+1} / ${S.case.events.length}`);text("toolName",`#${e.seq??S.step+1} ${e.name}`);text("toolStatus",e.status);
 $("toolStatus").className="pill"+(["blocked","timeout","tool_error","self_check_required","snap_too_far","no_depth_near_anchor","en_route"].includes(e.status)?" bad":"");
 const d=distance(S.step);text("currentDistance",d===null?"无可用目标距离":`目标距离 ${fmt(d,3)} m`);
 text("captureNote",e.fresh_images?"本步返回的新图像":`显示上一观测 #${e.image_asof_seq??"?"}；本调用未返回新图像`);
 const views=$("views");views.replaceChildren();for(const direction of ["front","right","back","left"]){const im=e.images.find(x=>x.view===direction),card=element("div","view-card"),label=element("div","view-label");label.append(element("span","",direction.toUpperCase()),element("span","",im?`${im.width} × ${im.height}`:"未记录"));card.append(label);if(im){const wrap=imageWrap(im,e.next_point);wrap.onclick=()=>{text("zoomTitle",`${direction.toUpperCase()} · 工具观测 #${e.image_asof_seq}`);$("zoomImage").replaceChildren(imageWrap(im,e.next_point));$("imageDialog").showModal();};card.append(wrap);}else card.append(element("div","image-wrap","无图像"));views.append(card);}
 const speech=$("speech");speech.replaceChildren();if(e.after_text.length)e.after_text.forEach(v=>speech.append(element("p","",v)));else speech.append(element("p","muted","此步没有公开说明。"));
 text("toolDetails",JSON.stringify({tool:e.name,input:e.input,status:e.status,error:e.error??undefined,steps:e.steps??undefined,collisions:e.collisions??undefined,replans:e.replans??undefined,done_probability:e.done_probability??undefined,local_visual_target_distance:e.distance_to_visual_target??undefined,offline_goal_viewpoint_distance:d,offline_position:e.position,heading_deg:e.heading},null,2));
 $("previous").disabled=S.step===0;$("next").disabled=S.step===S.case.events.length-1;
 const first=S.case.events.findIndex((x,i)=>distance(i)!==null&&distance(i)<S.case.summary.threshold_m);$("jumpPass").disabled=first<0;$("jumpPass").title=first<0?"没有一次返回观测的位置通过严格判据":"跳转到第一次满足严格距离的位置（不表示模型识别正确）";
 const p=e.position,levels=S.maps[S.case.summary.scene]||[];if(p&&levels.length){const nearest=levels.reduce((best,v,i)=>Math.abs(v.height-p[1])<Math.abs(levels[best].height-p[1])?i:best,0);if(S.floor!==nearest){S.floor=nearest;S.mapView=null;}$("floorSelect").value=S.floor;}
 requestAnimationFrame(()=>{drawMap();drawDistance();});
}
function canvas(id){const node=$(id),box=node.getBoundingClientRect(),ratio=window.devicePixelRatio||1;node.width=Math.max(1,Math.round(box.width*ratio));node.height=Math.max(1,Math.round(box.height*ratio));const ctx=node.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);return {node,ctx,w:box.width,h:box.height};}
function fitMap(){
 if(!S.case)return;const box=$("mapCanvas").getBoundingClientRect(),level=(S.maps[S.case.summary.scene]||[])[S.floor];const height=level?.height??S.case.events[S.step].position?.[1]??0;
 const pts=[...S.case.trajectory,...(S.case.geometry?.goal_viewpoints||[])].filter(p=>Math.abs(p[1]-height)<.95);if(!pts.length)pts.push(...S.case.trajectory);
 const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[2]),minx=Math.min(...xs),maxx=Math.max(...xs),minz=Math.min(...zs),maxz=Math.max(...zs);
 S.mapView={cx:(minx+maxx)/2,cz:(minz+maxz)/2,scale:Math.min((box.width-40)/Math.max(6,maxx-minx+3),(box.height-35)/Math.max(6,maxz-minz+3))};
}
const mapImages=new Map();
function drawMap(){
 if(!S.case||$("replayTab").hidden)return;if(!S.mapView)fitMap();const {ctx,w,h}=canvas("mapCanvas"),v=S.mapView,level=(S.maps[S.case.summary.scene]||[])[S.floor],height=level?.height??S.case.events[S.step].position?.[1]??0;
 const X=x=>w/2+(x-v.cx)*v.scale,Z=z=>h/2+(z-v.cz)*v.scale;ctx.fillStyle="#fafbfd";ctx.fillRect(0,0,w,h);
 if(level){const url=level.url||level.image;let im=mapImages.get(url);if(!im){im=new Image();im.onload=()=>drawMap();im.src=url;mapImages.set(url,im);}if(im.complete&&im.naturalWidth)ctx.drawImage(im,X(level.lower_xz[0]),Z(level.lower_xz[1]),level.width*level.meters_per_pixel*v.scale,level.height_px*level.meters_per_pixel*v.scale);}
 const points=S.case.trajectory,end=S.case.events[S.step].dense_index??points.length-1;
 ctx.lineWidth=1.5;ctx.strokeStyle="#a2afbb66";ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(X(p[0]),Z(p[2])):ctx.moveTo(X(p[0]),Z(p[2])));ctx.stroke();
 for(let i=1;i<=Math.min(end,points.length-1);i++){const a=points[i-1],b=points[i];ctx.strokeStyle=Math.abs(b[1]-height)<.9?"#2876bd":"#2876bd33";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(X(a[0]),Z(a[2]));ctx.lineTo(X(b[0]),Z(b[2]));ctx.stroke();}
 ctx.fillStyle="#8f62bd65";for(const p of S.case.geometry?.goal_viewpoints||[]){if(Math.abs(p[1]-height)>.9)continue;ctx.beginPath();ctx.arc(X(p[0]),Z(p[2]),1.8,0,Math.PI*2);ctx.fill();}
 S.case.events.forEach((e,i)=>{if(!e.position||Math.abs(e.position[1]-height)>.9)return;ctx.beginPath();ctx.arc(X(e.position[0]),Z(e.position[2]),i===S.step?5:2.5,0,Math.PI*2);ctx.fillStyle=i===S.step?"#d1495b":i<=S.step?"#2463a6":"#b5c0ca";ctx.fill();});
 const p=S.case.events[S.step].position;if(p){ctx.strokeStyle="#c44154";ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(p[0]),Z(p[2]),8,0,Math.PI*2);ctx.stroke();const heading=S.case.events[S.step].heading;if(Number.isFinite(heading)){const a=heading*Math.PI/180,x=X(p[0]),z=Z(p[2]),endX=x+Math.cos(a)*23,endZ=z+Math.sin(a)*23;ctx.beginPath();ctx.moveTo(x,z);ctx.lineTo(endX,endZ);ctx.moveTo(endX+Math.cos(a+2.5)*7,endZ+Math.sin(a+2.5)*7);ctx.lineTo(endX,endZ);ctx.lineTo(endX+Math.cos(a-2.5)*7,endZ+Math.sin(a-2.5)*7);ctx.stroke();}}
 ctx.fillStyle="#75889b";ctx.font="10px system-ui, 'Review CJK'";ctx.fillText("x → / z ↓",10,16);ctx.fillText("GT 仅用于离线查看",10,h-10);
}
function drawDistance(){
 if(!S.case||$("replayTab").hidden)return;const {ctx,w,h}=canvas("distanceCanvas"),L=44,R=16,T=25,B=33,items=S.case.events.map((e,i)=>({i,d:distance(i)})),valid=items.filter(v=>v.d!==null);const max=Math.max(2,...valid.map(v=>v.d))*1.12;
 const X=i=>L+i/Math.max(1,items.length-1)*(w-L-R),Y=d=>h-B-d/max*(h-T-B);ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.font="10px system-ui, 'Review CJK'";
 for(let k=0;k<=4;k++){const value=max*k/4;ctx.strokeStyle="#ecf0f4";ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(L,Y(value));ctx.lineTo(w-R,Y(value));ctx.stroke();ctx.fillStyle="#8191a1";ctx.fillText(value.toFixed(1),6,Y(value)+3);}
 for(const [value,color,dash] of [[1,"#258264",[2,4]],[S.case.summary.threshold_m,"#c74756",[6,4]]]){ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(L,Y(value));ctx.lineTo(w-R,Y(value));ctx.stroke();}ctx.setLineDash([]);
 ctx.strokeStyle="#356fa5";ctx.lineWidth=2;ctx.beginPath();let opened=false;for(const v of items){if(v.d===null){opened=false;continue;}if(opened)ctx.lineTo(X(v.i),Y(v.d));else ctx.moveTo(X(v.i),Y(v.d));opened=true;}ctx.stroke();
 for(const v of valid){ctx.beginPath();ctx.arc(X(v.i),Y(v.d),v.i===S.step?4.5:2.5,0,Math.PI*2);ctx.fillStyle=v.d<S.case.summary.threshold_m?"#258264":v.i===S.step?"#d1495b":"#356fa5";ctx.fill();}
 ctx.strokeStyle="#d1495b88";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(X(S.step),T-6);ctx.lineTo(X(S.step),h-B);ctx.stroke();ctx.fillStyle="#8090a0";
 for(let k=0;k<=4;k++){const i=Math.round((items.length-1)*k/4);ctx.fillText(String(S.case.events[i].seq??i+1),X(i)-4,h-13);}ctx.fillText("m",8,16);ctx.fillText("工具序列",w-60,h-2);
}
function setup(){
 for(const id of ["search","dataset","executor","outcome","pattern"])$(id).addEventListener(id==="search"?"input":"change",renderList);
 $("previous").onclick=()=>setStep(S.step-1);$("next").onclick=()=>setStep(S.step+1);$("stepSlider").oninput=e=>setStep(Number(e.target.value));$("jumpEnd").onclick=()=>setStep(S.case.events.length-1);
 $("jumpPass").onclick=()=>{const i=S.case.events.findIndex((x,j)=>distance(j)!==null&&distance(j)<S.case.summary.threshold_m);if(i>=0)setStep(i);};
 $("play").onclick=()=>{if(S.timer)return stop();if(S.step===S.case.events.length-1)setStep(0);text("play","暂停");S.timer=setInterval(()=>{if(S.step===S.case.events.length-1)return stop();setStep(S.step+1);},950);};
 $("skillSelect").onchange=showSkill;$("floorSelect").onchange=e=>{S.floor=Number(e.target.value);S.mapView=null;drawMap();};$("fitMap").onclick=()=>{S.mapView=null;drawMap();};
 $("compare").onclick=()=>{const r=counterpart();if(r)loadCase(r.key);};$("export").onclick=()=>{const a=element("a");a.href=`export/${encodeURIComponent(S.key)}.html`;a.download=S.key+".html";a.click();};
 $("copyId").onclick=async()=>{try{await navigator.clipboard.writeText(S.case.summary.task_id);text("copyId","已复制");setTimeout(()=>text("copyId","复制 ID"),1200);}catch{window.prompt("Episode ID",S.case.summary.task_id);}};
 $("closeDialog").onclick=()=>$("imageDialog").close();$("imageDialog").onclick=e=>{if(e.target===$("imageDialog"))$("imageDialog").close();};
 document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("active",x===b));for(const key of ["replay","policy","details"])$(key+"Tab").hidden=b.dataset.tab!==key;requestAnimationFrame(()=>{drawMap();drawDistance();});});
 document.addEventListener("keydown",e=>{if(["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName)||$("imageDialog").open)return;if(e.key==="ArrowRight"){e.preventDefault();setStep(S.step+1);}if(e.key==="ArrowLeft"){e.preventDefault();setStep(S.step-1);}if(e.code==="Space"){e.preventDefault();$("play").click();}});
 window.addEventListener("resize",()=>{S.mapView=null;drawMap();drawDistance();});
 $("distanceCanvas").onclick=e=>{const box=e.target.getBoundingClientRect();setStep(Math.round((e.clientX-box.left-44)/(box.width-60)*(S.case.events.length-1)));};
 $("distanceCanvas").onmousemove=e=>{if(!S.case)return;const box=e.target.getBoundingClientRect(),i=Math.max(0,Math.min(S.case.events.length-1,Math.round((e.clientX-box.left-44)/(box.width-60)*(S.case.events.length-1))));e.target.title=`工具 #${S.case.events[i].seq??i+1} · ${fmt(distance(i),3)} m`;};
 const map=$("mapCanvas");let drag=null;
 map.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,cx:S.mapView.cx,cz:S.mapView.cz,moved:0};map.setPointerCapture(e.pointerId);};map.onpointermove=e=>{if(!drag)return;drag.moved=Math.max(drag.moved,Math.hypot(e.clientX-drag.x,e.clientY-drag.y));S.mapView.cx=drag.cx-(e.clientX-drag.x)/S.mapView.scale;S.mapView.cz=drag.cz-(e.clientY-drag.y)/S.mapView.scale;drawMap();};
 map.onpointerup=e=>{if(drag&&drag.moved<4){const box=map.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top,v=S.mapView;let best=12,index=-1;S.case.events.forEach((step,i)=>{if(!step.position)return;const delta=Math.hypot(box.width/2+(step.position[0]-v.cx)*v.scale-x,box.height/2+(step.position[2]-v.cz)*v.scale-y);if(delta<best){best=delta;index=i;}});if(index>=0)setStep(index);}drag=null;};
 map.onwheel=e=>{e.preventDefault();if(!S.mapView)return;const box=map.getBoundingClientRect(),v=S.mapView,dx=e.clientX-box.left-box.width/2,dy=e.clientY-box.top-box.height/2;const old=v.scale;v.scale=Math.max(.2,Math.min(350,v.scale*Math.exp(-e.deltaY*.0015)));v.cx+=dx/old-dx/v.scale;v.cz+=dy/old-dy/v.scale;drawMap();};
}
async function boot(){
 setup();try{if(window.OFFLINE_REVIEW){document.body.classList.add("offline");S.index=window.OFFLINE_REVIEW.index;S.maps=window.OFFLINE_REVIEW.maps;text("modeBadge",S.index.label);}else{const responses=await Promise.all([fetch("api/index"),fetch("api/maps")]);if(!responses[0].ok)throw Error("无法读取索引");S.index=await responses[0].json();S.maps=responses[1].ok?await responses[1].json():{};}
 S.index.cases.sort((a,b)=>Number(a.strict_success)-Number(b.strict_success)||a.group.localeCompare(b.group)||a.task_id.localeCompare(b.task_id));renderList();const hash=decodeURIComponent(location.hash.slice(1)),candidate=S.index.cases.find(r=>r.key===hash)||S.index.cases.find(r=>r.task_id==="objectnav_plant_7mxmsvcqjpj_0"&&r.group==="hm3dv2_geo")||S.index.cases[0];await loadCase(candidate.key);
 }catch(e){text("loading",`无法加载回放：${e.message}。请按 README 启动本地服务，或打开生成的单条离线 HTML。`);}}
boot();

async function loadPortableCase(key){if(window.OFFLINE_REVIEW.cases[key])return window.OFFLINE_REVIEW.cases[key];if(!window.OFFLINE_REVIEW.index.cases.some(x=>x.key===key))throw Error("未知 episode");await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="cases/"+encodeURIComponent(key)+".js";s.onload=resolve;s.onerror=()=>reject(Error("离线任务文件缺失"));document.head.append(s);});return window.OFFLINE_REVIEW.cases[key];}
document.getElementById("compareVersion").onclick=()=>{if(S.key)location.href="../v2/index.html#"+encodeURIComponent(S.key);};
