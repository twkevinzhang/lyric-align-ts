import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPerformanceReport} from '../../scripts/performance-summary.mjs';
test('performance report cannot claim success for slow, missing or duplicate trials',()=>{
 const manifest={createdAt:'2026-10-24T00:00:00Z',cpu:'fixture',browser:'fixture',config:{trials:1,songs:[{id:'song'}]}};
 const row={variant:'production',trial:1,song:'song',metrics:{operationSeconds:3.001},score:{total:1,rows:[{line:1,usable:true,error:.2}]}};
 assert.match(renderPerformanceReport({manifest,results:[row]},'evidence'),/0\/1 通過/);
 assert.match(renderPerformanceReport({manifest,results:[]},'evidence'),/未完整/);
 row.metrics.operationSeconds=3;
 assert.match(renderPerformanceReport({manifest,results:[row]},'evidence'),/1\/1 通過/);
 assert.match(renderPerformanceReport({manifest,results:[row,row]},'evidence'),/未完整/);
});
