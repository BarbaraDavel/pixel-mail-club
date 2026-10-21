// Navegación local: no lee ni modifica datos de Firebase.
export function initAdminTabs(root=document,browser=window){
 const buttons=[...root.querySelectorAll('.admin-nav [role="tab"]')];
 const panels=new Map(buttons.map(button=>[button.dataset.panel,root.getElementById(button.dataset.panel)]));
 let active=buttons[0]?.dataset.panel;
 function show(id,{updateUrl=true,focus=false}={}){
  if(!panels.has(id)||!panels.get(id))return;
  active=id;
  for(const button of buttons){
   const selected=button.dataset.panel===id;
   button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
   panels.get(button.dataset.panel).hidden=!selected;
   if(selected&&focus)button.focus();
  }
  if(updateUrl)browser.history.replaceState(null,'',browser.location.pathname+browser.location.search+'#'+id);
 }
 function restore(){
  let id;
  try{id=decodeURIComponent(browser.location.hash.slice(1));}catch{id='';}
  const target=root.getElementById(id);
  const panel=panels.has(id)?panels.get(id):target?.closest('[role="tabpanel"]');
  show(panel?.id||active,{updateUrl:false});
  if(target&&target!==panel){
   let parent=target.parentElement;
   while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
  }
  return target;
 }
 buttons.forEach((button,index)=>{
  button.addEventListener('click',()=>show(button.dataset.panel));
  button.addEventListener('keydown',event=>{
   let next;
   if(event.key==='ArrowRight')next=(index+1)%buttons.length;
   else if(event.key==='ArrowLeft')next=(index-1+buttons.length)%buttons.length;
   else if(event.key==='Home')next=0;
   else if(event.key==='End')next=buttons.length-1;
   else return;
   event.preventDefault();show(buttons[next].dataset.panel,{focus:true});
  });
 });
 browser.addEventListener('hashchange',()=>{
  const target=restore();
  if(target?.closest('[role="tabpanel"]'))target.scrollIntoView({block:'nearest'});
 });
 restore();
 return {show,restore};
}
