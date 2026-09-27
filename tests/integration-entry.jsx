import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppProvider,useApp} from '../src/context/AppContext';
import {MemoryRouter} from 'react-router-dom';
import Quiz from '../src/pages/Quiz';
import Flashcards from '../src/pages/Flashcards';
import Dashboard from '../src/pages/Dashboard';
import Schedule from '../src/pages/Schedule';
import Settings from '../src/pages/Settings';
import PDFLibrary from '../src/pages/PDFLibrary';
import PDFViewer from '../src/pages/PDFViewer';
import {Routes,Route} from 'react-router-dom';
export {processPdf} from '../src/utils/processPdf';
export {storage} from '../src/utils/storage';
export {savePdfBlob,getPdfBlob} from '../src/utils/db';
export const act=React.act;
let current;
function Probe(){current=useApp();return null;}
export function app(){return current;}
export async function mount(element,route='/'){
 const root=createRoot(element);
 await act(async()=>root.render(<AppProvider><MemoryRouter initialEntries={[route]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Probe/><Routes><Route path="/quiz" element={<Quiz/>}/><Route path="/flashcards" element={<Flashcards/>}/><Route path="/" element={<Dashboard/>}/><Route path="/schedule" element={<Schedule/>}/><Route path="/settings" element={<Settings/>}/><Route path="/pdfs" element={<PDFLibrary/>}/><Route path="/pdfs/:id" element={<PDFViewer/>}/></Routes></MemoryRouter></AppProvider>));
 return ()=>act(async()=>root.unmount());
}
