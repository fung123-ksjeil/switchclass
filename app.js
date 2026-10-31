const $=id=>document.getElementById(id), days=['월','화','수','목','금'];
let book,sheet,selected=null,matches=[],request=0,proposal='';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=id=>sheet.teachers.find(t=>t.id===id)?.name||id;
const time=x=>`${days[x.day]}요일 ${x.period}교시`;

function load(data){book=data;$('sheet').innerHTML=book.sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}${s.hidden?' · 이전':''}</option>`).join('');$('sheet').value=String(Math.max(0,book.sheets.findIndex(s=>!s.hidden)));changeSheet();}
function changeSheet(){if(!book)return;sheet=book.sheets[+$('sheet').value];$('search').value='';clear();}
function clear(){if(!sheet)return;request++;selected=null;matches=[];draw();render();}
function visibleMatches(){return matches.filter(m=>!$('sameDay').checked||m.lesson.day===selected?.day);}
function draw(){
 if(!sheet)return;
 const ranks=new Map(visibleMatches().map((m,i)=>[m.lesson.id,i+1]));
 let head='<tr><th class="teacher-col" rowspan="2">교사</th>';
 for(let d=0;d<5;d++)head+=`<th colspan="${sheet.slots.filter(s=>s.day===d).length}" class="day-head">${days[d]}요일</th>`;
 head+='</tr><tr>'+sheet.slots.map(s=>`<th class="period-head ${s.period===1?'day-start':''}">${s.period}</th>`).join('')+'</tr>';
 $('gridHead').innerHTML=head;
 const lookup=new Map(sheet.lessons.map(x=>[`${x.teacher}/${x.day}/${x.period}`,x]));
 const query=$('search').value.trim();let html='';
 for(const t of sheet.teachers.filter(t=>t.name.includes(query))){
  html+=`<tr><th scope="row" class="teacher-col ${selected?.teacher===t.id?'selected-teacher':''}">${esc(t.name)}</th>`;
  for(const s of sheet.slots){
   const x=lookup.get(`${t.id}/${s.day}/${s.period}`),rank=x?ranks.get(x.id):null;
   html+=`<td class="${s.period===1?'day-start':''}">${x?`<button data-id="${esc(x.id)}" ${rank?'data-match="true"':''} ${isFixedLesson(x)?'title="고정 수업 · 교체 불가"':''} class="${/^\d+-\d+$/.test(x.group)?'':'activity'} ${selected?.id===x.id?'active':''} ${rank?'possible':''} ${isFixedLesson(x)?'fixed-lesson':''}" aria-pressed="${selected?.id===x.id}" aria-label="${esc(t.name)} ${time(x)} ${esc(x.subject)} ${esc(x.group)}${isFixedLesson(x)?' 고정 수업 교체 불가':''}${rank?' 교체 추천 '+rank+'순위':''}">${rank?`<em>${rank}</em>`:''}<b>${esc(x.subject)}</b><span>${esc(x.group||'활동')}</span></button>`:'<span class="free">·</span>'}</td>`;
  }
  html+='</tr>';
 }
 $('grid').innerHTML=html||`<tr><td colspan="${sheet.slots.length+1}" class="no-teachers">검색한 교사가 없습니다.</td></tr>`;
}
async function choose(id){selected=sheet.lessons.find(x=>x.id===id);matches=[];draw();$('results').innerHTML='<div class="empty">교체 가능한 시간을 확인하고 있어요…</div>';const token=++request;try{const data=swapCandidates(sheet,id);if(token!==request)return;matches=data;draw();render();}catch(e){if(token===request){$('status').hidden=false;$('status').textContent=e.message;render();}}}
function render(){$('selection').innerHTML=selected?`<span>비워야 하는 수업</span><b>${esc(name(selected.teacher))} · ${time(selected)}</b><br>${esc(selected.subject)} / ${esc(selected.group||'학급 미지정 활동')}`:'';const list=visibleMatches();$('resultCount').textContent=list.length;if(!selected){$('results').innerHTML='<div class="empty"><p>교체할 수업을 클릭하세요.</p></div>';return;}if(!list.length){$('results').innerHTML=`<div class="empty"><div>⌕</div><h3>${isFixedLesson(selected)?'교체할 수 없는 고정 수업입니다.':'조건에 맞는 교체가 없어요.'}</h3><p>${isFixedLesson(selected)?'스A · 스B · 스클 · 주1 · 주2 · 창체 · 진로는 교체 대상에서 제외됩니다.':!/^\d+-\d+$/.test(selected.group)?'학급이 지정되지 않은 활동은 자동 교체할 수 없어요.':'두 교사의 빈 시간과 같은 학급 조건을 충족하는<br>단독 수업이 없습니다. 다른 수업이나 요일 조건을 확인하세요.'}</p></div>`;return;}$('results').innerHTML=list.map((m,i)=>{const o=m.lesson,changes=m.changes.filter(c=>c.teacher===o.teacher);return `<article class="candidate" data-card="${esc(o.id)}"><div class="candidate-head"><h3>${i+1}. ${esc(name(o.teacher))}<small>${esc(o.subject)} · ${esc(o.group)}</small></h3><span class="score">${m.score}점</span></div><div class="swap-path">${time(o)}</div><div class="changes">${changes.map(c=>`${days[c.day]} 시수 ${c.before.count}→${c.after.count} · 연속 ${c.before.run}→${c.after.run}`).join(' / ')}</div><div class="candidate-bottom"><button data-locate="${esc(o.id)}">시간표에서 보기</button><button data-proposal="${esc(o.id)}">제안 보기 ↗</button></div></article>`;}).join('');}
$('grid').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;if(b.dataset.match){[...$('results').querySelectorAll('[data-proposal]')].find(x=>x.dataset.proposal===b.dataset.id)?.click();}else choose(b.dataset.id);};$('sheet').onchange=changeSheet;$('search').oninput=()=>{if(!sheet)return;draw();};$('reset').onclick=clear;$('sameDay').onchange=()=>{draw();render();};$('criteria').onclick=()=>{$('criteriaText').hidden=!$('criteriaText').hidden;};
$('results').onclick=e=>{const locate=e.target.closest('[data-locate]');if(locate){$('search').value='';draw();const cell=[...$('grid').querySelectorAll('[data-id]')].find(x=>x.dataset.id===locate.dataset.locate);cell?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});cell?.focus({preventScroll:true});return;}const b=e.target.closest('[data-proposal]');if(!b)return;const m=matches.find(m=>m.lesson.id===b.dataset.proposal),o=m.lesson;proposal=`${selected.group} 학급\n\n${name(selected.teacher)} · ${selected.subject}\n${time(selected)} → ${time(o)}\n\n${name(o.teacher)} · ${o.subject}\n${time(o)} → ${time(selected)}`;$('proposal').textContent=proposal;$('copy').textContent='제안 내용 복사';$('dialog').showModal();};$('close').onclick=()=>$('dialog').close();$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(proposal);$('copy').textContent='복사 완료';}catch{$('copy').textContent='내용을 직접 선택해 복사하세요';}};
$('upload').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('status').hidden=true;$('status').textContent='';try{if(file.size>5000000)throw Error('5MB 이하 파일을 선택하세요.');load(parseWorkbook(await file.arrayBuffer()));$('status').textContent='';$('status').hidden=true;}catch(err){$('status').hidden=false;$('status').textContent=err.message;}e.target.value='';};
