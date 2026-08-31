import {classifyByIdealZone} from '../src/case_entry_research.js';
const ideal={start:100,end:200};
if(classifyByIdealZone({decisionTime:150},ideal)!=='IN_IDEAL_ZONE')throw new Error('case engine');
console.log('V10 frontend research smoke OK');
