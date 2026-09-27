import { generateStudyMaterials } from './flashcardUtils';
self.onmessage = ({ data }) => {
  try {
    const result = generateStudyMaterials(data.text, undefined, data.meta, progress => self.postMessage({ progress }));
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error.message }); }
};
