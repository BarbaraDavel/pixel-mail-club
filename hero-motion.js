// Control local de la decoración; sin Firebase ni almacenamiento.
const toggle=document.getElementById('heroMotionToggle');
const hero=toggle?.closest('.hero');
if(toggle&&hero){
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const sync=()=>{toggle.hidden=reduced.matches;};
 toggle.addEventListener('click',()=>{
  const paused=hero.classList.toggle('motion-paused');
  toggle.setAttribute('aria-pressed',String(paused));
  toggle.textContent=paused?'Reanudar animación':'Pausar animación';
 });
 reduced.addEventListener('change',sync);sync();
}
