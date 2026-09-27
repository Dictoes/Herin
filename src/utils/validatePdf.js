export const MAX_PDF_BYTES=60*1024*1024;
export async function validatePdf(file){
 if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw Error(`"${file.name}" isn't a PDF file and was skipped.`);
 if(file.size>MAX_PDF_BYTES)throw Error(`"${file.name}" is larger than 60 MB and was skipped.`);
 if(!(await file.slice(0,1024).text()).includes('%PDF-'))throw Error('The file does not contain a valid PDF header.');
 return true;
}
