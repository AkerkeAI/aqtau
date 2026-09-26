const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let auth,states,index;
function compile(file,overrides={}) {
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m={exports:{}};new Function('exports','require','module',code)(m.exports,n=>overrides[n]||require(n),m);return m.exports;
}
const types=compile('lib/resolutions/types.ts');
const {ResolutionSection}=compile('components/resolution-section.tsx',{
 react:{...React,useState:()=>[states[index++],()=>{}],useEffect:()=>{}},
 '@/lib/auth-context':{useAuth:()=>auth},
 '@/lib/supabase-client':{supabase:{storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'https://example.invalid/image.png'}})})}}},
 '@/lib/supporter-token':{getSupporterToken:()=> 'test-token'},
 '@/lib/resolutions/types':types,
});
function render(role,author='other',state='needs_review'){
 auth={user:{id:'self'},isDeveloper:role==='developer'};index=0;
 states=[[{id:'resolution',submitted_by:author,submitted_at:'2026-09-26',state,reviewed_at:null,note:'Работы выполнены',after_photo_path:'test.png',ai_result:{likely_resolved:false,confidence:0.2,observations:['Требуется проверка'],requires_human_review:true}}],false,'','',null,false,false,[]];
 return renderToStaticMarkup(React.createElement(ResolutionSection,{report:{id:'report',status:'in_progress',photoUrl:null},isOperator:role==='operator',onChanged:async()=>{}}));
}
const operator=render('operator');assert(!operator.includes('>Подтвердить решение</button>'));assert(operator.includes('Ожидает проверки разработчиком'));assert(operator.includes('20%'));
const developer=render('developer');assert(developer.includes('>Подтвердить решение</button>'));assert(developer.includes('Проблема не решена / Повторно открыть'));
const self=render('developer','self');assert(!self.includes('>Подтвердить решение</button>'));assert(self.includes('Это ваши доказательства'));
const resident=render(null);assert(!resident.includes('>Подтвердить решение</button>'));assert(resident.includes('Проблема остаётся'));
assert(types.resolutionLabel({state:'verified',reviewed_at:null}).includes('не зафиксирована'));
console.log('PASS: operator sees advisory but no final control; developer sees independent decisions; self-review hidden; anonymous feedback remains; legacy verified is not labelled independent.');
