const FIXED_SUBJECTS=new Set(['스A','스B','스클','주1','주2','창체','진로']);
function isFixedLesson(lesson){return FIXED_SUBJECTS.has(String(lesson?.subject||'').replace(/\s+/g,'').toUpperCase());}
/* XLSX parsing and swap calculation run entirely in this browser. */
function parseWorkbook(bytes) {
  let total = 0;
  const files = fflate.unzipSync(new Uint8Array(bytes), {filter(entry) {
    total += entry.originalSize;
    if (total > 30000000) throw Error('압축 해제 크기가 너무 큽니다.');
    return /^xl\/(workbook.xml|_rels\/workbook.xml.rels|sharedStrings.xml|worksheets\/[^/]+\.xml)$/.test(entry.name);
  }});
  const xml = path => {
    if (!files[path]) throw Error('엑셀 구성 파일이 없습니다.');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(files[path]), 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('엑셀 XML을 읽지 못했습니다.');
    return doc;
  };
  const nodes = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
  const strings = files['xl/sharedStrings.xml'] ? nodes(xml('xl/sharedStrings.xml'), 'si').map(s => nodes(s,'t').map(t=>t.textContent).join('')) : [];
  const rels = Object.fromEntries(nodes(xml('xl/_rels/workbook.xml.rels'),'Relationship').map(r=>[r.getAttribute('Id'), r.getAttribute('Target')]));
  const sheets = [];
  for (const item of nodes(xml('xl/workbook.xml'),'sheet')) {
    const target = rels[item.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')];
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : 'xl/'+target;
    const cells = {};
    for (const c of nodes(xml(path),'c')) {
      const v = nodes(c,'v')[0];
      let text = v ? v.textContent : nodes(c,'t').map(t=>t.textContent).join('');
      if(c.getAttribute('t')==='s') text=strings[Number(text)]||'';
      cells[c.getAttribute('r')]=text.trim();
    }
    const slots=[];let day=null;
    for(let col=3;col<60;col++) {
      let n=col,label='';while(n){const rem=(n-1)%26;label=String.fromCharCode(65+rem)+label;n=Math.floor((n-1)/26);}
      if(['월','화','수','목','금'].includes(cells[label+'1'])) day=['월','화','수','목','금'].indexOf(cells[label+'1']);
      const period=Number(cells[label+'2']);
      if(day!==null && Number.isInteger(period) && period>=1 && period<=12)slots.push({col:label,day,period});
    }
    const teachers=[],lessons=[];
    const rows=Object.keys(cells).filter(k=>/^B\d+$/.test(k)).map(k=>Number(k.slice(1))).sort((a,b)=>a-b);
    for(const row of rows){
      const name=cells['B'+row];if(row<3||!name||!/^\d+$/.test(cells['A'+row]||''))continue;
      const teacher=String(row);teachers.push({id:teacher,name});
      for(const s of slots){const subject=cells[s.col+row];if(subject)lessons.push({id:row+'-'+s.col,teacher,day:s.day,period:s.period,subject,group:cells[s.col+(row+1)]||''});}
    }
    if(teachers.length&&slots.length)sheets.push({name:item.getAttribute('name'),hidden:item.getAttribute('state')==='hidden',teachers,lessons,slots:slots.map(({day,period})=>({day,period}))});
  }
  if(!sheets.length)throw Error('지원하는 시간표가 없습니다. 1행 요일, 2행 교시, B열 교사, 수업 아래 행 학급 형식을 사용하세요.');
  return {sheets};
}
function swapCandidates(sheet,selectedId){
  const lessons=sheet.lessons,a=lessons.find(x=>x.id===selectedId);
  if(!a||isFixedLesson(a)||!/^\d+-\d+$/.test(a.group))return [];
  const key=(...v)=>JSON.stringify(v);
  const occupied=new Set(lessons.map(x=>key(x.teacher,x.day,x.period))),counts=new Map();
  for(const x of lessons)if(x.group){const k=key(x.group,x.day,x.period);counts.set(k,(counts.get(k)||0)+1);}
  if(counts.get(key(a.group,a.day,a.period))!==1)return [];
  const burden=(teacher,day,remove=null,add=null)=>{
    const periods=lessons.filter(x=>x.teacher===teacher&&x.day===day&&x.id!==remove).map(x=>x.period);
    if(add!==null)periods.push(add);
    let run=0,best=0,previous=-2;
    for(const p of [...new Set(periods)].sort((a,b)=>a-b)){run=p===previous+1?run+1:1;best=Math.max(best,run);previous=p;}
    return {count:periods.length,run:best};
  };
  const results=[];
  for(const b of lessons){
    if(isFixedLesson(b)||b.teacher===a.teacher||b.group!==a.group||(b.day===a.day&&b.period===a.period))continue;
    if(occupied.has(key(b.teacher,a.day,a.period))||occupied.has(key(a.teacher,b.day,b.period)))continue;
    if(counts.get(key(b.group,b.day,b.period))!==1)continue;
    const changes=[];let penalty=0;
    for(const teacher of [b.teacher,a.teacher]){
      const own=teacher===b.teacher?b:a,incoming=teacher===b.teacher?a:b,weight=teacher===b.teacher?2:1;
      for(const day of [...new Set([a.day,b.day])].sort()){
        const before=burden(teacher,day),after=burden(teacher,day,own.id,incoming.day===day?incoming.period:null);
        penalty+=weight*(Math.max(0,after.run-Math.max(1,before.run))*12+Math.max(0,after.count-5)*6+Math.max(0,after.count-before.count)*3);
        changes.push({teacher,day,before,after});
      }
    }
    results.push({lesson:b,score:Math.max(0,100-penalty),changes});
  }
  return results.sort((a,b)=>b.score-a.score||a.lesson.day-b.lesson.day||a.lesson.period-b.lesson.period||a.lesson.teacher.localeCompare(b.lesson.teacher));
}
// Compare the effective weekly schedule after every saved swap plus this proposal.
// Dates are intentionally not assumed: the user can confirm a different-date overlap.
function savedSwapConflicts(sheet,savedPairs,proposedLessons){
 const combined=[...savedPairs.map(p=>({...p,isNew:false})),{lessons:proposedLessons,isNew:true}];
 const movedIds=new Set(combined.flatMap(p=>p.lessons.map(l=>l.id))),effective=[];
 for(const lesson of sheet.lessons)if(!movedIds.has(lesson.id))effective.push({...lesson,isNew:false});
 for(const pair of combined){const [a,b]=pair.lessons;effective.push({...a,day:b.day,period:b.period,isNew:pair.isNew},{...b,day:a.day,period:a.period,isNew:pair.isNew});}
 const teachers=new Map(),groups=new Map(),conflicts=new Map();
 const add=(day,period,label)=>{const key=day+'/'+period;if(!conflicts.has(key))conflicts.set(key,{day,period,labels:new Set()});conflicts.get(key).labels.add(label);};
 for(const lesson of effective){
  for(const [map,id] of [[teachers,lesson.teacher],[groups,lesson.group]]){
   if(!id)continue;const key=JSON.stringify([id,lesson.day,lesson.period]);if(!map.has(key))map.set(key,[]);map.get(key).push(lesson);
  }
 }
 for(const [map,type] of [[teachers,'teacher'],[groups,'group']])for(const items of map.values()){
  if(items.length<2||!items.some(l=>l.isNew))continue;
  const l=items[0],label=type==='teacher'?(sheet.teachers.find(t=>t.id===l.teacher)?.name||l.teacher)+' 선생님':l.group+' 학급';add(l.day,l.period,label);
 }
 for(const lesson of proposedLessons)if(savedPairs.some(p=>p.lessons.some(l=>l.id===lesson.id)))add(lesson.day,lesson.period,'다른 교체에도 포함된 수업');
 return [...conflicts.values()].sort((a,b)=>a.day-b.day||a.period-b.period).map(c=>({...c,labels:[...c.labels]}));
}
if(typeof module!=='undefined')module.exports={swapCandidates,isFixedLesson,savedSwapConflicts};
