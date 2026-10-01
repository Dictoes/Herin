const fs=require('node:fs');
const assert=require('node:assert/strict');
exports.capture=async(page,name)=>{
 const dir=process.env.HERIN_DESIGN_DIR||'test-results/design';fs.mkdirSync(dir,{recursive:true});
 for(const width of [360,768,1440])for(const mode of ['light','dark']){
  await page.setViewportSize({width,height:960});
  await page.evaluate(mode=>{document.documentElement.dataset.mode=mode;window.scrollTo(0,0);},mode);
  if(name.startsWith('populated-pdfs-'))await page.locator('.pdf-text-layer span').first().waitFor();
  await page.screenshot({path:`${dir}/${name}-${mode}-${width}.png`,fullPage:true,animations:'disabled'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${width}: horizontal page overflow`);
 }
 await page.setViewportSize({width:1440,height:900});
 if(name==='populated-settings'){
  await page.getByRole('button',{name:/Choose theme/}).click();
  for(const viewport of [{width:320,height:640},{width:375,height:812},{width:430,height:932},{width:640,height:360},{width:768,height:1024},{width:1440,height:900}]){
   await page.setViewportSize(viewport);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const bounds=await page.locator('#theme-chooser').evaluate(el=>{const rect=el.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};});
   assert.ok(bounds.left>=0&&bounds.right<=viewport.width,`Theme menu overflows horizontally at ${viewport.width}px: ${JSON.stringify(bounds)}`);
   assert.ok(bounds.top>=0&&bounds.bottom<=viewport.height,`Theme menu overflows vertically at ${viewport.width}x${viewport.height}: ${JSON.stringify(bounds)}`);
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:900});
  const results=await page.evaluate(()=>{
   const root=document.documentElement,theme=root.dataset.theme,mode=root.dataset.mode;
  const customVariables=['--bg-primary','--bg-secondary','--surface-card','--surface-raised','--text-primary','--text-secondary','--accent-primary','--accent-secondary','--border-color','--border-strong','--paper','--surface','--surface-sunken','--ink','--ink-soft','--ink-faint','--border','--primary','--primary-dark','--primary-tint','--focus-color','--custom-button','--custom-button-text'];
  const inlineTheme=Object.fromEntries(customVariables.map(name=>[name,root.style.getPropertyValue(name)]));
  customVariables.forEach(name=>root.style.removeProperty(name));
  const sample=document.createElement('div');document.body.append(sample);
   const rgb=value=>{sample.style.color=value;return getComputedStyle(sample).color.match(/[\d.]+/g).slice(0,3).map(Number);};
   const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const results=[];
   for(const t of ['ocean','forest','plum','soft-pastel','cozy-bear','calm-ocean','warm-study','lavender-focus','mint-garden','high-contrast'])for(const m of ['light','dark']){
    root.dataset.theme=t;root.dataset.mode=m;
    for(const [fg,bg] of [['var(--ink)','var(--surface)'],['var(--ink-soft)','var(--paper)'],['var(--ink-faint)','var(--surface)'],['var(--primary-dark)','var(--primary-tint)'],['#ffffff','var(--primary)']]){
     const a=luminance(fg),b=luminance(bg);results.push({theme:t,mode:m,fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
    }
   }
   sample.remove();root.dataset.theme=theme;root.dataset.mode=mode;
   customVariables.forEach(name=>{if(inlineTheme[name])root.style.setProperty(name,inlineTheme[name]);});
   return results;
  });
  fs.writeFileSync(`${dir}/contrast.json`,JSON.stringify(results,null,2));
  for(const result of results)assert.ok(result.ratio>=4.5,`Contrast: ${JSON.stringify(result)}`);
 }
};
