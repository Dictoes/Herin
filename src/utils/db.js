import { cloudActive, cloudUser, uploadCloudPdf, downloadCloudPdf, removeCloudPdf } from './cloudStore';
const DB_NAME='studydesk-files', STORE='pdfs';
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function cacheOperation(id,mode,blob){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode==='get'?'readonly':'readwrite');const store=tx.objectStore(STORE);const req=mode==='get'?store.get(id):mode==='put'?store.put({id,blob}):store.delete(id);let result;req.onsuccess=()=>{result=mode==='get'?req.result?.blob||null:true;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('PDF cache unavailable.'));};});}
export const getLegacyPdfBlob=id=>cacheOperation(id,'get');
export async function savePdfBlob(id,file){
 const user=cloudUser();
 if(!user)return cacheOperation(id,'put',file);
 await uploadCloudPdf(id,file);
 if(user!==cloudUser())throw Error('Account changed during upload. Sign in again to continue.');
 // A cache failure must not turn a successful cloud upload into a failed import.
 await cacheOperation(user+':'+id,'put',file).catch(()=>{});return true;
}
export async function getPdfBlob(id){
 const user=cloudUser();if(!user)return getLegacyPdfBlob(id);
 if(navigator.onLine!==false){try{const file=await downloadCloudPdf(id);await cacheOperation(user+':'+id,'put',file).catch(()=>{});return file;}catch(error){const cached=await cacheOperation(user+':'+id,'get').catch(()=>null);if(cached)return cached;throw error;}}
 return cacheOperation(user+':'+id,'get');
}
export async function deletePdfBlob(id){
 const user=cloudUser();if(!cloudActive())return cacheOperation(id,'delete');
 await removeCloudPdf(id);await cacheOperation(user+':'+id,'delete').catch(()=>{});return true;
}
