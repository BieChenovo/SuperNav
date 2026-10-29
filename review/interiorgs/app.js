'use strict';
const D=window.INTERIOR_DATA,$=id=>document.getElementById(id),M=Object.keys(D.labels),T=['objectnav','multi-objectnav'];
const S={case:null,step:0,key:null,timer:null,load:0,maps:{}};
const pct=x=>(x*100).toFixed(2)+'%',num=x=>x==null?'—':Number(x).toFixed(3),taskName=t=>t==='objectnav'?'单目标':'多目标';
const threshold=()=>$('threshold').value,score=r=>r.scores[threshold()];
function cell(row,text,cls){const e=document.createElement('td');e.textContent=text;if(cls)e.className=cls;row.append(e);return e;}
function compare(){
 const cohort=$('cohort').value,t=Number(threshold());$('comparison').replaceChildren();
 $('cohortNote').textContent=cohort==='matched'?`四方法共同完成：单目标 ${D.common.objectnav.length} 条，多目标 ${D.common['multi-objectnav'].length} 条。`:'各方法分母按实际完成数计算；任务集合略有不同。';
 const table=document.createElement('table'),head=table.createTHead().insertRow();['方法','单目标 n','单目标 SR','单目标 SPL','多目标 n','多目标 SR','多目标 SPL'].forEach(s=>{const h=document.createElement('th');h.textContent=s;head.append(h);});
 for(const m of M){const row=table.insertRow();cell(row,D.labels[m]);for(const task of T){const a=D.aggregates.find(x=>x.cohort===cohort&&x.task===task&&x.method===m&&x.threshold_m===t);cell(row,String(a.n));const c=cell(row,`${pct(a.sr)} (${a.successes}/${a.n})`);const b=document.createElement('span');b.className='bar';b.style.width=(a.sr*95)+'px';c.append(b);cell(row,a.spl.toFixed(4));}}
 for(const m of ['geo','learned']){const row=table.insertRow();row.className='paper';cell(row,`论文 ${m==='geo'?'Geo':'Learned'} · 1 m`);for(const task of T){const a=D.paper[m][task];cell(row,'150');cell(row,pct(a.sr));cell(row,a.spl.toFixed(4));}}
 $('comparison').append(table);if(t!==1){const p=document.createElement('p');p.className='notice';p.textContent='此处本轮显示 0.1 米评分；论文行仍是 1 米，阈值不同，不直接计算差距。';$('comparison').append(p);}
}
function list(){
 const query=$('search').value.toLowerCase(),method=$('method').value,task=$('task').value,outcome=$('outcome').value;
 const rows=D.cases.filter(r=>(!method||r.method===method)&&(!task||r.task===task)&&(!outcome||(outcome==='success')===!!score(r).success)&&(!query||(r.task_id+' '+r.scene+' '+r.instruction).toLowerCase().includes(query)));
 $('caseList').replaceChildren();$('count').textContent=`显示 ${rows.length} / ${D.completed} 条已完成记录`;
 for(const r of rows){const b=document.createElement('button');b.className='case'+(r.key===S.key?' active':'');b.dataset.key=r.key;const label=document.createElement('span');label.className=score(r).success?'success':'fail';label.textContent=`${score(r).success?'成功':'失败'} · ${D.labels[r.method]} · ${taskName(r.task)}`;const id=document.createElement('small');id.textContent=r.task_id;b.append(label,id);b.onclick=()=>openCase(r.key);$('caseList').append(b);}
}
async function openCase(key){
 if(!D.cases.some(r=>r.key===key))return;stop();const ticket=++S.load;
 try{if(!window.INTERIOR_CASES[key])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='cases/'+encodeURIComponent(key)+'.js';s.onload=resolve;s.onerror=()=>reject(Error('任务文件缺失，请完整拉取仓库'));document.head.append(s);});if(ticket!==S.load)return;
 S.case=window.INTERIOR_CASES[key];S.key=key;S.step=0;history.replaceState(null,'','#'+encodeURIComponent(key));$('empty').hidden=true;$('detail').hidden=false;
 const c=S.case,r=c.summary;$('caseLabel').textContent=D.labels[r.method]+' · '+taskName(r.task);$('episodeId').textContent=r.task_id;$('instruction').textContent=r.instruction;
 $('timeline').max=c.events.length-1;$('parameters').textContent=JSON.stringify(c.parameters,null,2);$('switches').replaceChildren();
 for(const method of M){const other=D.cases.find(x=>x.method===method&&x.task===r.task&&x.task_id===r.task_id);const b=document.createElement('button');b.textContent=D.labels[method];b.disabled=!other||method===r.method;b.onclick=()=>openCase(other.key);$('switches').append(b);}
 $('document').replaceChildren();[{name:'完整 Prompt',text:c.prompt},...c.skills].forEach((d,i)=>{const o=document.createElement('option');o.value=i;o.textContent=d.name;$('document').append(o);});documentText();render();list();
 }catch(e){$('empty').hidden=false;$('empty').textContent=e.message;console.error(e);}
}
function documentText(){if(!S.case)return;const docs=[{text:S.case.prompt},...S.case.skills];$('documentText').textContent=docs[Number($('document').value)||0].text;}
function render(){
 if(!S.case)return;const c=S.case,r=c.summary,e=c.events[S.step],sc=score(r);$('badge').textContent=(sc.success?'成功':'失败')+` · ${threshold()} m`;$('badge').className=sc.success?'success':'fail';
 $('metrics').textContent=`到达 ${sc.visited_targets}/${sc.target_count} 个目标 · SPL ${sc.spl.toFixed(4)} · 路程 ${sc.path_length_m.toFixed(1)} m · 参考长度 ${sc.reference_length_m.toFixed(1)} m · 动作 ${r.steps??'—'} · 用时 ${(r.elapsed_s/60).toFixed(1)} 分钟`;
 $('timeline').value=S.step;$('stepLabel').textContent=`工具事件 ${S.step+1}/${c.events.length}`;$('eventLabel').textContent=e.name+' · '+e.status+` · 动作事件位置 ${e.primitive_index}`;
 const isNav=['hab_visual_point_navigate','hab_local_navigate'].includes(e.name),before=$('before').checked&&isNav&&e.input_images.length>0,images=before?e.input_images:e.images;
 $('imageNote').textContent=before?'选点时可见的图像；下方地图显示本次调用执行后的实际位置。':e.fresh_images?'本次工具返回的新图像。':'本次没有新图像，显示最近一次观测。';$('views').replaceChildren();
 for(const im of images){const div=document.createElement('div');div.className='view';const box=document.createElement('div');box.className='picture';const img=document.createElement('img');img.src=im.url;img.alt=im.view;box.append(img);
 const ref=e.input.image_ref,view=e.input.view||'front',point=e.input.point;
 if(before&&Array.isArray(point)&&point.length===2&&point.every(v=>typeof v==='number'&&v>=0&&v<=1)&&(ref?im.ref===ref:im.view===view)){const dot=document.createElement('span');dot.className='dot';dot.style.left=100*point[0]+'%';dot.style.top=100*point[1]+'%';box.append(dot);}
 const label=document.createElement('small');label.textContent=im.view+' · '+im.width+'×'+im.height;div.append(box,label);$('views').append(div);}
 $('tool').textContent=JSON.stringify({tool:e.name,input:e.input,result:{status:e.status,steps:e.steps,collided:e.collided,error:e.error,actual_position:e.position}},null,2);$('speech').replaceChildren();
 for(const txt of [...(S.step===0?c.intro:[]),...e.text]){const p=document.createElement('p');p.textContent=txt;$('speech').append(p);}
 $('targets').replaceChildren();c.targets.forEach((t,i)=>{const li=document.createElement('li'),hit=sc.arrivals[i];li.textContent=(hit!=null&&hit<=e.primitive_index?'✓ ':'○ ')+t.description;li.className=hit!=null&&hit<=e.primitive_index?'success':'';$('targets').append(li);});drawMap();drawDistance();
}
function drawMap(){
 const c=S.case,e=c.events[S.step],canvas=$('map'),ctx=canvas.getContext('2d'),pos=e.position||c.primitive_events[e.primitive_index].position;
 const maps=D.maps[c.summary.scene]||[],m=maps.reduce((best,x)=>!best||Math.abs(x.height-pos[1])<Math.abs(best.height-pos[1])?x:best,null);
 ctx.clearRect(0,0,canvas.width,canvas.height);let project;
 if(m){if(!S.maps[m.url]){const im=new Image();S.maps[m.url]=im;im.onload=()=>{if(S.case)drawMap();};im.src=m.url;}
 const scale=Math.min((canvas.width-30)/m.width,(canvas.height-30)/m.height_px),ox=(canvas.width-m.width*scale)/2,oy=(canvas.height-m.height_px*scale)/2;
 if(S.maps[m.url].complete)ctx.drawImage(S.maps[m.url],ox,oy,m.width*scale,m.height_px*scale);project=p=>[ox+(p[0]-m.lower[0])/m.mpp*scale,oy+(p[2]-m.lower[1])/m.mpp*scale];
 }else return;
 c.targets.forEach((t,i)=>{ctx.fillStyle='#d58b29';for(const p of t.views){const [x,y]=project(p);ctx.beginPath();ctx.arc(x,y,2.8,0,Math.PI*2);ctx.fill();}const [x,y]=project(t.views[0]);ctx.fillStyle='#9d5500';ctx.font='bold 13px sans-serif';ctx.fillText(String(i+1),x+6,y-6);});
 const path=c.primitive_events;function line(end,color,width){ctx.beginPath();for(let i=0;i<=end&&i<path.length;i++){const p=project(path[i].position);i?ctx.lineTo(...p):ctx.moveTo(...p);}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
 line(path.length-1,'#c1cedb',1.4);line(e.primitive_index,'#2675bb',2.5);const [x,y]=project(pos);ctx.fillStyle='#e54b40';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();const start=project(path[0].position);ctx.fillStyle='#16866c';ctx.fillRect(start[0]-4,start[1]-4,8,8);
}
function drawDistance(){
 const c=S.case,curve=c.scores[threshold()].curve,canvas=$('distance'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad=38;
 ctx.clearRect(0,0,w,h);const max=Math.max(1.5,...curve.map(x=>x.distance??0)),x=i=>pad+i/Math.max(1,curve.length-1)*(w-pad*1.4),y=d=>h-pad-d/max*(h-pad*1.5);
 ctx.strokeStyle='#cbd6e0';ctx.beginPath();ctx.moveTo(pad,15);ctx.lineTo(pad,h-pad);ctx.lineTo(w-15,h-pad);ctx.stroke();ctx.font='12px sans-serif';ctx.fillStyle='#5c7085';ctx.fillText(max.toFixed(1)+' m',2,22);ctx.fillText('0',15,h-pad+5);ctx.fillText(String(curve.length-1),w-48,h-13);
 ctx.setLineDash([5,4]);ctx.strokeStyle='#249a76';ctx.beginPath();ctx.moveTo(pad,y(Number(threshold())));ctx.lineTo(w-15,y(Number(threshold())));ctx.stroke();ctx.setLineDash([]);
 const colors=['#2879bb','#d5882c','#9a65b8','#279483','#c6556a'];for(let i=1;i<curve.length;i++){if(curve[i].distance==null||curve[i-1].distance==null||curve[i].target!==curve[i-1].target)continue;ctx.strokeStyle=colors[curve[i].target%colors.length];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(i-1),y(curve[i-1].distance));ctx.lineTo(x(i),y(curve[i].distance));ctx.stroke();}
 const index=Math.min(c.events[S.step].primitive_index,curve.length-1),d=curve[index];ctx.strokeStyle='#e04d43';ctx.beginPath();ctx.moveTo(x(index),15);ctx.lineTo(x(index),h-pad);ctx.stroke();ctx.fillStyle='#24364b';ctx.fillText(`目标 ${d.target+1} · ${num(d.distance)} m`,pad+12,25);
}
function stop(){if(S.timer)clearInterval(S.timer);S.timer=null;$('play').textContent='播放';}
$('progress').textContent=`已完成 ${D.completed}/${D.expected} 条 · 剩余 ${D.remaining} 条 · 四版本计划各 50 条单目标 + 50 条多目标`;
$('runNotice').textContent=D.status==='complete'?'全部 400 条已完成。1 米结果为保存轨迹的离线重评分；同时保留公开代码的 0.1 米评分。':'部分结果 · OpenAI 连接中断后停止。未完成任务不计为失败。1 米结果是保存轨迹的离线重评分。';
for(const id of ['task','method','outcome'])$(id).onchange=list;$('search').oninput=list;$('cohort').onchange=compare;
$('threshold').onchange=()=>{compare();list();render();};$('before').onchange=render;$('document').onchange=documentText;
$('prev').onclick=()=>{if(S.case){S.step=Math.max(0,S.step-1);render();}};$('next').onclick=()=>{if(S.case){S.step=Math.min(S.case.events.length-1,S.step+1);render();}};
$('last').onclick=()=>{if(S.case){S.step=S.case.events.length-1;render();}};$('timeline').oninput=()=>{S.step=Number($('timeline').value);render();};
$('play').onclick=()=>{if(S.timer){stop();return;}S.timer=setInterval(()=>{if(!S.case||S.step>=S.case.events.length-1){stop();return;}S.step++;render();},900);$('play').textContent='暂停';};
compare();list();let initial;try{initial=decodeURIComponent(location.hash.slice(1));}catch{}openCase(D.cases.some(r=>r.key===initial)?initial:D.cases[0].key);
