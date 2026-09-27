// Replay only local edits onto the latest server snapshot after offline work.
// Independent additions from another device must never be treated as deletions.
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function mergeWorkspace(base,local,remote){
  if(equal(base,local))return remote;
  if(local===undefined)return undefined;
  if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)&&[...base,...local,...remote].every(v=>object(v)&&v.id)){
    const before=new Map(base.map(v=>[v.id,v])),after=new Map(local.map(v=>[v.id,v])),server=new Map(remote.map(v=>[v.id,v]));
    const result=[];
    for(const id of new Set([...server.keys(),...after.keys()])){
      if(before.has(id)&&!after.has(id))continue;
      const value=mergeWorkspace(before.get(id),after.get(id),server.get(id));
      if(value!==undefined)result.push(value);
    }
    return result;
  }
  if(object(local)&&object(remote)){
    const result={};
    for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){
      const value=mergeWorkspace(base?.[key],local[key],remote[key]);if(value!==undefined)result[key]=value;
    }
    return result;
  }
  return local;
}
