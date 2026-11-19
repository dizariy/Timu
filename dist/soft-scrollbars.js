export function installSoftScrollbars(dialog){
  const scroller=dialog.querySelector('.dialog-scroll');
  const bindings=[];
  function attach(target,parent,isPage=false){
    const track=document.createElement('div'),thumb=document.createElement('div');
    track.className='soft-scrollbar';thumb.className='soft-scrollbar-thumb';thumb.tabIndex=0;
    if(!target.id)target.id=isPage?'page-scroll-region':'dialog-scroll-region';
    thumb.setAttribute('aria-controls',target.id);
    thumb.setAttribute('role','scrollbar');thumb.setAttribute('aria-label',isPage?'Прокрутка страницы':'Прокрутка окна');
    thumb.setAttribute('aria-orientation','vertical');thumb.setAttribute('aria-valuemin','0');
    track.append(thumb);parent.append(track);
    let timer,frame=0,drag=null,travel=0,max=0;
    function update(){
      frame=0;max=Math.max(0,target.scrollHeight-target.clientHeight);
      track.hidden=max<1||(!isPage&&!dialog.open);
      if(track.hidden)return;
      const height=track.clientHeight,size=Math.max(28,height*target.clientHeight/target.scrollHeight);
      travel=Math.max(1,height-size);thumb.style.height=size+'px';thumb.style.top=(target.scrollTop/max*travel)+'px';
      thumb.setAttribute('aria-valuemax',String(Math.round(max)));thumb.setAttribute('aria-valuenow',String(Math.round(target.scrollTop)));
    }
    function queue(){if(!frame)frame=requestAnimationFrame(update)}
    function reveal(){track.classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>{if(!drag)track.classList.remove('visible')},850);queue()}
    (isPage?window:target).addEventListener('scroll',reveal,{passive:true});
    thumb.addEventListener('pointerdown',e=>{if(e.button!==0)return;update();drag={y:e.clientY,top:target.scrollTop};thumb.setPointerCapture(e.pointerId);reveal();e.preventDefault()});
    thumb.addEventListener('pointermove',e=>{if(drag){target.scrollTop=drag.top+(e.clientY-drag.y)/travel*max;queue()}});
    const release=()=>{drag=null;reveal()};thumb.addEventListener('pointerup',release);thumb.addEventListener('lostpointercapture',release);
    thumb.addEventListener('keydown',e=>{const steps={ArrowDown:48,ArrowUp:-48,PageDown:target.clientHeight*.85,PageUp:-target.clientHeight*.85,Home:-max,End:max};if(!(e.key in steps))return;e.preventDefault();target.scrollTop+=steps[e.key];reveal()});
    const observer=new ResizeObserver(queue);observer.observe(target);observer.observe(isPage?document.body:dialog.querySelector('#dialog-content'));
    addEventListener('resize',queue,{passive:true});bindings.push({update:queue,reveal});queue();
  }
  attach(document.scrollingElement,document.body,true);attach(scroller,dialog);
  new MutationObserver(()=>bindings.forEach(b=>b.update())).observe(dialog,{attributes:true,attributeFilter:['open']});
  return {refresh:()=>bindings.forEach(b=>b.update())};
}
