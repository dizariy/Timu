import {defaultNewsFilters,newsDay} from './news-filter.js';
import {refreshIcon} from './ui-icons.js';
import {NEWS_PRIORITY_LABELS} from './news-priority.js';

const filterTone = {urgent:'negative',important:'positive',ordinary:'neutral'};
const calendarIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M8 4v4m8-4v4M4 11h16"/></svg>';

function dateField(name, label, value, today) {
  return `<label>${label}<span class="filter-date-field">
    <span class="filter-date-summary" aria-hidden="true"><span class="filter-date-value"></span>${calendarIcon}</span>
    <input name="${name}" type="date" aria-label="Дата добавления ${label.toLowerCase()}" value="${value}" max="${today}">
  </span></label>`;
}

const resetIcon = `<span class="reset-glyph" aria-hidden="true">${refreshIcon}
  <span class="reset-glyph-white">${refreshIcon}</span><span class="reset-glyph-cover">${refreshIcon}</span>
</span>`;

export function createNewsFilterDialog({openDialog,closeDialog,getDialogContent,getFilters,setFilters}){
  return function openFilters(){
    const current=getFilters();
    const choices=Object.entries(NEWS_PRIORITY_LABELS);
    const today = newsDay(new Date());
    openDialog(`<div class="filter-heading"><p class="eyebrow">НОВОСТНАЯ ЛЕНТА</p><h2 id="dialog-title">Фильтр</h2></div><form class="filter-form"><fieldset><legend class="filter-legend-hidden">Категории новостей</legend><div class="filter-choices">${choices.map(([value,title])=>`<label class="filter-choice ${filterTone[value]}"><input class="filter-checkbox" type="checkbox" name="priority" value="${value}" ${current.priorities.includes(value)?'checked':''}><span class="filter-choice-copy"><strong>${title}</strong><span class="filter-indicator" aria-hidden="true"></span></span><span class="filter-check" aria-hidden="true"><span class="filter-glyph"><span class="filter-bar"></span><span class="filter-bar filter-bar-vertical"></span></span></span></label>`).join('')}</div></fieldset><fieldset><legend>Дата добавления</legend><div class="filter-dates">${dateField('from','С',current.from,today)}${dateField('to','По',current.to,today)}</div><div class="filter-presets"><button type="button" data-days="1" aria-pressed="false">Сегодня</button><button type="button" data-days="7" aria-pressed="false">7 дней</button><button type="button" data-days="30" aria-pressed="false">30 дней</button><button type="button" data-days="0" aria-pressed="false">За всё время</button></div></fieldset><p class="filter-error" role="alert" hidden></p><div class="filter-actions"><button type="button" class="clear-filters" aria-label="Сбросить фильтры" title="Сбросить фильтры">${resetIcon}</button><button type="submit" class="apply">Применить</button></div></form>`);
    const root=getDialogContent(),form=root.querySelector('form');
    const resetButton=form.querySelector('.clear-filters');
    const dateInputs=[form.elements.from,form.elements.to].map(input=>({
      input, display:input.closest('.filter-date-field').querySelector('.filter-date-value')
    }));
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const rotations=new WeakMap();
    function turn(element){
      if(!element?.animate||reducedMotion.matches)return;
      rotations.get(element)?.cancel();
      const animation=element.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:680,easing:'cubic-bezier(.12,.72,.18,1)'});
      rotations.set(element,animation);
    }
    function rangeFor(days){
      const today=newsDay(new Date()),since=new Date(today+'T12:00:00Z');
      since.setUTCDate(since.getUTCDate()-Math.max(0,days-1));
      return {from:days?since.toISOString().slice(0,10):'',to:days?today:''};
    }
    function syncDates(){
      for (const {input, display} of dateInputs) {
        display.textContent = input.value ? input.value.split('-').reverse().join('.') : 'дд.мм.гггг';
        display.classList.toggle('date-empty', !input.value);
      }
      form.querySelectorAll('[data-days]').forEach(button=>{
        const range=rangeFor(Number(button.dataset.days));
        button.setAttribute('aria-pressed',form.elements.from.value===range.from&&form.elements.to.value===range.to);
      });
    }
    form.querySelectorAll('[name="priority"]').forEach(input=>input.onchange=()=>turn(input.closest('.filter-choice').querySelector('.filter-glyph')));
    form.onsubmit=event=>{
      event.preventDefault();
      const from=form.elements.from.value,to=form.elements.to.value,error=form.querySelector('.filter-error');
      if(from&&to&&from>to){error.hidden=false;error.textContent='Начальная дата должна быть не позже конечной.';return}
      setFilters({priorities:[...form.querySelectorAll('[name="priority"]:checked')].map(e=>e.value),from,to});closeDialog();
    };
    resetButton.onclick=()=>{
      const defaults=defaultNewsFilters();
      form.querySelectorAll('[name="priority"]').forEach(input=>{input.checked=defaults.priorities.includes(input.value)});
      form.elements.from.value=defaults.from;form.elements.to.value=defaults.to;
      form.querySelector('.filter-error').hidden=true;
      syncDates();setFilters(defaults);
      if(reducedMotion.matches)return;
      if(resetButton.classList.contains('is-resetting')){
        resetButton.classList.remove('is-resetting');
        // Recognize the cleared animation before replaying a quick second reset.
        void resetButton.offsetWidth;
      }
      resetButton.classList.add('is-resetting');
    };
    resetButton.addEventListener('animationend',event=>{
      if(event.target===resetButton&&event.animationName==='filter-reset-fill')resetButton.classList.remove('is-resetting');
    });
    form.querySelectorAll('[data-days]').forEach(button=>button.onclick=()=>{
      const range=rangeFor(Number(button.dataset.days));
      form.elements.from.value=range.from;form.elements.to.value=range.to;
      form.querySelector('.filter-error').hidden=true;syncDates();
    });
    for(const {input} of dateInputs){
      input.addEventListener('input', syncDates);
      input.addEventListener('change', syncDates);
      input.closest('label').addEventListener('pointerdown',()=>input.classList.add('date-pointer-focus'));
      input.addEventListener('blur',()=>input.classList.remove('date-pointer-focus'));
    }
    syncDates();
  };
}
