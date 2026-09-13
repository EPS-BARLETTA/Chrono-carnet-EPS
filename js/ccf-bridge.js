"use strict";
window.CCFBridge={
 version:1,
 identity(data){return {type:'DF_CCF_IDENTITY',v:1,sessionId:data.sessionId||'',groupId:data.groupId||'',studentId:data.studentId,last:data.last||'',first:data.first||'',classroom:data.classroom||'',sex:data.sex||'',project1:data.project1||'',project2:data.project2||''}},
 result(data){return {type:'DF_CCF_RESULT',v:1,resultId:data.resultId||((crypto.randomUUID&&crypto.randomUUID())||Date.now().toString(36)),sessionId:data.sessionId||'',groupId:data.groupId||'',studentId:data.studentId,race:Number(data.race),project:data.project||'',splits:(data.splits||[]).map(Number),totalMs:Number(data.totalMs),createdAt:new Date().toISOString()}},
 parse(raw){let d=typeof raw==='string'?JSON.parse(raw):raw;if(!d||d.v!==1||!d.type)throw new Error('QR non conforme');return d}
};