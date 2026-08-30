
import {scanCaseTf,explainCase} from './case_entry_research.js';

self.onmessage=e=>{
  const msg=e.data||{};
  try{
    if(msg.type==='SCAN'){
      const out=[];
      const items=msg.items||[];
      for(let i=0;i<items.length;i++){
        const x=items[i];
        self.postMessage({type:'PROGRESS',done:i,total:items.length,timeframe:x.tf});
        out.push(scanCaseTf(x.rows,x.tf,msg.structureCase,msg.contextRows||[]));
      }
      self.postMessage({type:'DONE',results:out});
    }else if(msg.type==='EXPLAIN'){
      self.postMessage({type:'EXPLANATION',rows:explainCase(msg.candidates||[],msg.feedback||{})});
    }
  }catch(err){
    self.postMessage({type:'ERROR',message:String(err?.stack||err)});
  }
};
