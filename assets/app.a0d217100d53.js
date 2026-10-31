const $=id=>document.getElementById(id), days=['월','화','수','목','금'];
let book,sheet,selected=null,matches=[],request=0,proposal='',focusedTeacher=null,loadVersion=0,savedSwaps=[],savedKey='',proposalPair=null;
const CACHE_KEY='switchclass.timetable.v1';
const FORMAT_ERROR='지원하는 시간표가 없습니다. 1행 요일, 2행 교시, B열 교사, 수업 아래 행 학급 형식을 사용하세요.';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=id=>sheet.teachers.find(t=>t.id===id)?.name||id;
const time=x=>`${days[x.day]}요일 ${x.period}교시`;

function validateSheet(s){
 if(!s||!Array.isArray(s.teachers)||!s.teachers.length||!Array.isArray(s.lessons)||!Array.isArray(s.slots)||!s.slots.length)throw Error(FORMAT_ERROR);
 if(!s.teachers.every(t=>typeof t.id==='string'&&typeof t.name==='string')||!s.lessons.every(l=>['id','teacher','subject','group'].every(k=>typeof l[k]==='string')&&Number.isInteger(l.day)&&l.day>=0&&l.day<5&&Number.isInteger(l.period)&&l.period>=1&&l.period<=12)||!s.slots.every(t=>Number.isInteger(t.day)&&t.day>=0&&t.day<5&&Number.isInteger(t.period)&&t.period>=1&&t.period<=12))throw Error(FORMAT_ERROR);
 return s;
}
function load(data,label='기본 시간표'){
 const current=validateSheet(data.sheets.find(s=>!s.hidden)||data.sheets[0]);
 book=data;sheet=current;focusedTeacher=null;restoreSavedSwaps();$('sourceName').textContent=label;$('sourceName').title=label;clear();
}
function saveTimetable(label){
 try{localStorage.setItem(CACHE_KEY,JSON.stringify({sheet,label}));}
 catch{showStatus('시간표를 불러왔지만 브라우저에 저장할 수 없습니다. 저장 공간·브라우저 설정을 확인하세요.');}
}
function showStatus(message){$('status').hidden=!message;$('status').textContent=message;}
async function restoreTimetable(){
 const version=loadVersion;
 try{const raw=localStorage.getItem(CACHE_KEY);if(raw){const cached=JSON.parse(raw);validateSheet(cached.sheet);load({sheets:[cached.sheet]},cached.label||'저장된 시간표');return;}}catch{try{localStorage.removeItem(CACHE_KEY);}catch{}}
 try{
  let data=window.DEFAULT_TIMETABLE;
  if(!data){
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
   try{const response=await fetch('./default-timetable.json',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error();data=await response.json();}
   finally{clearTimeout(timeout);}
  }
  if(version===loadVersion)load(data,'기본 시간표');
 }catch{
  if(version===loadVersion){$('grid').innerHTML='<tr><td class="initial-empty">시간표를 읽지 못했습니다. 위의 시간표 불러오기로 파일을 선택할 수 있습니다.</td></tr>';showStatus('기본 시간표를 읽지 못했습니다. 새로고침하거나 시간표 파일을 선택하세요.');}
 }
}
function clear(){if(!sheet)return;request++;selected=null;matches=[];draw();render();}
function visibleMatches(){return matches.filter(m=>!$('sameDay').checked||m.lesson.day===selected?.day);}
function draw(){
 if(!sheet)return;
 const savedByLesson=new Map(savedSwaps.flatMap(pair=>pair.lessons.map(l=>[l.id,pair])));
 const ranks=new Map(visibleMatches().map((m,i)=>[m.lesson.id,i+1]));
 let head='<tr><th class="teacher-col" rowspan="2">교사</th>';
 for(let d=0;d<5;d++)head+=`<th colspan="${sheet.slots.filter(s=>s.day===d).length}" class="day-head">${days[d]}요일</th>`;
 head+='</tr><tr>'+sheet.slots.map(s=>`<th class="period-head ${s.period===1?'day-start':''}">${s.period}</th>`).join('')+'</tr>';
 $('gridHead').innerHTML=head;
 const lookup=new Map(sheet.lessons.map(x=>[`${x.teacher}/${x.day}/${x.period}`,x]));
 let html='';
 for(const t of sheet.teachers){
  html+=`<tr class="${focusedTeacher===t.id?'row-focused':focusedTeacher?'row-unfocused':''}"><th scope="row" class="teacher-col ${selected?.teacher===t.id?'selected-teacher':''}">${`<button class="teacher-name" data-teacher="${esc(t.id)}" aria-pressed="${focusedTeacher===t.id}" aria-label="${esc(t.name)} 시간표 강조">${esc(t.name)}</button>`}</th>`;
  for(const s of sheet.slots){
   const x=lookup.get(`${t.id}/${s.day}/${s.period}`),rank=x?ranks.get(x.id):null,pair=x?savedByLesson.get(x.id):null;
   html+=`<td class="${s.period===1?'day-start':''}">${x?`<button data-id="${esc(x.id)}" ${rank?'data-match="true"':''} ${isFixedLesson(x)?'title="고정 수업 · 교체 불가"':pair?`title="저장한 교체 ${pair.number}" data-saved="${esc(pair.id)}" style="--pair-bg:${pairColor(pair.number).bg};--pair-border:${pairColor(pair.number).border}"`:''} class="${/^\d+-\d+$/.test(x.group)?'':'activity'} ${selected?.id===x.id?'active':''} ${rank?'possible':''} ${isFixedLesson(x)?'fixed-lesson':''} ${pair?'saved-pair':''}" aria-pressed="${selected?.id===x.id}" aria-label="${esc(t.name)} ${time(x)} ${esc(x.subject)} ${esc(x.group)}${isFixedLesson(x)?' 고정 수업 교체 불가':''}${rank?' 교체 추천 '+rank+'순위':''}">${pair?`<strong class="pair-badge">${pair.number}</strong>`:''}${rank?`<em>${rank}</em>`:''}<b>${esc(x.subject)}</b><span>${esc(x.group||'활동')}</span></button>`:'<span class="free">·</span>'}</td>`;
  }
  html+='</tr>';
 }
 $('grid').innerHTML=html||`<tr><td colspan="${sheet.slots.length+1}" class="no-teachers">검색한 교사가 없습니다.</td></tr>`;
}
async function choose(id){selected=sheet.lessons.find(x=>x.id===id);matches=[];draw();$('results').innerHTML='<div class="empty">교체 가능한 시간을 확인하고 있어요…</div>';const token=++request;try{const data=swapCandidates(sheet,id);if(token!==request)return;matches=data;draw();render();}catch(e){if(token===request){$('status').hidden=false;$('status').textContent=e.message;render();}}}
function render(){$('selection').innerHTML=selected?`<span>비워야 하는 수업</span><b>${esc(name(selected.teacher))} · ${time(selected)}</b><br>${esc(selected.subject)} / ${esc(selected.group||'학급 미지정 활동')}`:'';const list=visibleMatches();$('resultCount').textContent=list.length;if(!selected){$('results').innerHTML='<div class="empty"><p>교체할 수업을 클릭하세요.</p></div>';return;}if(!list.length){$('results').innerHTML=`<div class="empty"><div>⌕</div><h3>${isFixedLesson(selected)?'교체할 수 없는 고정 수업입니다.':'조건에 맞는 교체가 없어요.'}</h3><p>${isFixedLesson(selected)?'스A · 스B · 스클 · 주1 · 주2 · 창체 · 진로는 교체 대상에서 제외됩니다.':!/^\d+-\d+$/.test(selected.group)?'학급이 지정되지 않은 활동은 자동 교체할 수 없어요.':'두 교사의 빈 시간과 같은 학급 조건을 충족하는<br>단독 수업이 없습니다. 다른 수업이나 요일 조건을 확인하세요.'}</p></div>`;return;}$('results').innerHTML=list.map((m,i)=>{const o=m.lesson;return `<article class="candidate" data-card="${esc(o.id)}"><div class="candidate-head"><h3>${i+1}. ${esc(name(o.teacher))}<small>${esc(o.subject)} · ${esc(o.group)}</small></h3><span class="score">${m.score}점</span></div><div class="swap-path">${time(o)}</div><div class="candidate-bottom"><button data-locate="${esc(o.id)}">시간표에서 보기</button><button data-proposal="${esc(o.id)}">제안 보기 ↗</button></div></article>`;}).join('');}
$('grid').onclick=e=>{const teacher=e.target.closest('[data-teacher]');if(teacher){focusedTeacher=focusedTeacher===teacher.dataset.teacher?null:teacher.dataset.teacher;draw();const target=[...$('grid').querySelectorAll('[data-teacher]')].find(x=>x.dataset.teacher===teacher.dataset.teacher);target?.focus({preventScroll:true});return;}const b=e.target.closest('[data-id]');if(!b)return;if(b.dataset.saved){openSavedProposal(b.dataset.saved);return;}if(b.dataset.match){[...$('results').querySelectorAll('[data-proposal]')].find(x=>x.dataset.proposal===b.dataset.id)?.click();}else choose(b.dataset.id);};$('reset').onclick=()=>{focusedTeacher=null;clear();};$('sameDay').onchange=()=>{draw();render();};$('criteria').onclick=()=>{$('criteriaText').hidden=!$('criteriaText').hidden;};
$('results').onclick=e=>{const locate=e.target.closest('[data-locate]');if(locate){focusedTeacher=null;draw();const cell=[...$('grid').querySelectorAll('[data-id]')].find(x=>x.dataset.id===locate.dataset.locate);cell?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});cell?.focus({preventScroll:true});return;}const b=e.target.closest('[data-proposal]');if(!b)return;const m=matches.find(m=>m.lesson.id===b.dataset.proposal);openProposal([selected,m.lesson]);};$('close').onclick=()=>$('dialog').close();$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(proposal);$('copy').textContent='복사 완료';}catch{$('copy').textContent='내용을 직접 선택해 복사하세요';}};
const PAIR_COLORS=[{bg:'#e5d5ff',border:'#713db4'},{bg:'#bcecf3',border:'#087b8c'},{bg:'#ffcfe1',border:'#a32f61'},{bg:'#c9efcf',border:'#28783a'},{bg:'#d4ddff',border:'#3f51b5'},{bg:'#ffdbbd',border:'#9e4c18'}];
const pairColor=n=>PAIR_COLORS[(n-1)%PAIR_COLORS.length];
function lessonSignature(l){return JSON.stringify([l.id,l.teacher,l.day,l.period,l.subject,l.group]);}
function restoreSavedSwaps(){
 const raw=JSON.stringify([sheet.teachers.map(t=>[t.id,t.name]),sheet.lessons.map(l=>lessonSignature(l)),sheet.slots]);
 let hash=2166136261;for(let i=0;i<raw.length;i++)hash=Math.imul(hash^raw.charCodeAt(i),16777619);
 savedKey='switchclass.swaps.v1.'+(hash>>>0).toString(16)+'.'+raw.length;
 savedSwaps=[];
 try{const data=JSON.parse(localStorage.getItem(savedKey)||'[]');if(Array.isArray(data))savedSwaps=data.filter(p=>typeof p.id==='string'&&Number.isInteger(p.number)&&p.number>0&&Array.isArray(p.lessons)&&p.lessons.length===2&&p.lessons.every(l=>sheet.lessons.some(x=>lessonSignature(x)===lessonSignature(l))));}catch{}
 updateSavedCount();
}
function updateSavedCount(){$('savedCount').textContent=savedSwaps.length;$('applicationOpen').disabled=!savedSwaps.length;}
function persistSwaps(next){
 try{localStorage.setItem(savedKey,JSON.stringify(next));savedSwaps=next;updateSavedCount();draw();return true;}
 catch{return false;}
}
function samePair(pair,lessons){return pair.lessons.map(l=>l.id).sort().join('|')===lessons.map(l=>l.id).sort().join('|');}
function openProposal(lessons){
 proposalPair=lessons.map(l=>({...l}));const [a,b]=proposalPair;
 proposal=`${a.group} 학급\n\n${name(a.teacher)} · ${a.subject}\n${time(a)} → ${time(b)}\n\n${name(b.teacher)} · ${b.subject}\n${time(b)} → ${time(a)}`;
 $('proposal').textContent=proposal;$('copy').textContent='제안 내용 복사';
 const existing=savedSwaps.find(p=>samePair(p,proposalPair));
 $('saveSwap').disabled=false;$('saveSwap').textContent=existing?'삭제':'저장';$('saveSwap').classList.toggle('delete-swap',!!existing);
 $('saveMessage').textContent=existing?`저장한 교체 ${existing.number}`:'';
 $('dialog').showModal();
}
function openSavedProposal(id){const pair=savedSwaps.find(p=>p.id===id);if(pair)openProposal(pair.lessons);}
$('saveSwap').onclick=()=>{
 if(!proposalPair)return;
 const existing=savedSwaps.find(p=>samePair(p,proposalPair));
 if(existing){
  if(!persistSwaps(savedSwaps.filter(p=>p.id!==existing.id))){$('saveMessage').textContent='삭제하지 못했습니다. 브라우저 저장 설정을 확인하세요.';return;}
  renderSavedList();$('saveSwap').textContent='저장';$('saveSwap').classList.remove('delete-swap');$('saveMessage').textContent='삭제했습니다.';return;
 }
 if(savedSwaps.some(p=>p.lessons.some(l=>proposalPair.some(x=>x.id===l.id)))){$('saveMessage').textContent='이미 다른 교체에 저장된 수업입니다. 저장 목록에서 기존 교체를 삭제한 뒤 저장하세요.';return;}
 const nextNumber=Math.max(0,...savedSwaps.map(p=>p.number))+1;
 const record={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),number:nextNumber,lessons:proposalPair};
 if(!persistSwaps([...savedSwaps,record])){$('saveMessage').textContent='브라우저에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인하세요.';return;}
 $('saveSwap').disabled=false;$('saveSwap').textContent='삭제';$('saveSwap').classList.add('delete-swap');$('saveMessage').textContent=`교체 ${nextNumber} 저장 완료 · 같은 색과 번호로 표시했습니다.`;
};
function renderSavedList(){
 $('savedList').innerHTML=savedSwaps.length?savedSwaps.map(pair=>{const [a,b]=pair.lessons,c=pairColor(pair.number);return `<article class="saved-item" style="--pair-bg:${c.bg};--pair-border:${c.border}"><h3><span class="saved-number">${pair.number}</span> ${esc(a.group)} 학급</h3><p>${esc(name(a.teacher))} · ${esc(a.subject)}<br>${time(a)} → ${time(b)}</p><p>${esc(name(b.teacher))} · ${esc(b.subject)}<br>${time(b)} → ${time(a)}</p><div><button data-saved-view="${esc(pair.id)}">시간표에서 보기</button><button data-application="${esc(pair.id)}">결보강신청서</button><button data-saved-remove="${esc(pair.id)}">삭제</button></div></article>`;}).join(''):'<p class="empty">저장한 교체가 없습니다.</p>';
}
$('savedOpen').onclick=()=>{if(!sheet)return;renderSavedList();$('savedDialog').showModal();};
$('savedClose').onclick=()=>$('savedDialog').close();
$('savedList').onclick=e=>{
 const application=e.target.closest('[data-application]');if(application){openApplication(application.dataset.application);return;}
 const remove=e.target.closest('[data-saved-remove]');
 if(remove){if(!persistSwaps(savedSwaps.filter(p=>p.id!==remove.dataset.savedRemove))){showStatus('저장 목록을 변경하지 못했습니다. 브라우저 설정을 확인하세요.');return;}renderSavedList();return;}
 const view=e.target.closest('[data-saved-view]');if(!view)return;
 const pair=savedSwaps.find(p=>p.id===view.dataset.savedView);if(!pair)return;
 focusedTeacher=null;selected=null;matches=[];draw();render();$('savedDialog').close();
 const button=[...$('grid').querySelectorAll('[data-id]')].find(b=>b.dataset.id===pair.lessons[0].id);
 button?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});button?.focus({preventScroll:true});
};
$('formatClose').onclick=()=>$('formatDialog').close();
$('upload').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;const version=++loadVersion;showStatus('');
 try{
  if(file.size>5000000)throw Error('5MB 이하 파일을 선택하세요.');
  const data=parseWorkbook(await file.arrayBuffer());if(version!==loadVersion)return;load(data,file.name);saveTimetable(file.name);
 }catch(err){
  $('formatMessage').textContent=file.size>5000000?'5MB 이하 파일을 선택하세요.':'';
  $('formatMessage').hidden=file.size<=5000000;
  $('formatDialog').showModal();if(!sheet)restoreTimetable();
 }finally{e.target.value='';}
};
restoreTimetable();
