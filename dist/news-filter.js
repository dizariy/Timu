import {NEWS_PRIORITY_LABELS} from './news-priority.js';

const priorities = Object.keys(NEWS_PRIORITY_LABELS);
const legacyPriorities = {negative:'urgent',positive:'important',neutral:'ordinary'};
const moscowDayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
export const defaultNewsFilters = () => ({priorities:[...priorities], from:'', to:''});
export function validDay(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function newsDay(value){
  if(validDay(value))return value;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  const parts=moscowDayFormat.formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export function normalizeNewsFilters(value){
  if(!value||typeof value!=='object')return defaultNewsFilters();
  // Users who previously chose a label keep that label after the migration.
  const choices = Array.isArray(value.priorities) ? value.priorities
    : Array.isArray(value.impacts) ? value.impacts.map(impact=>legacyPriorities[impact]) : priorities;
  let from=validDay(value.from)?value.from:'',to=validDay(value.to)?value.to:'';
  if(from&&to&&from>to){from='';to=''}
  return {priorities:priorities.filter(priority=>choices.includes(priority)),from,to};
}
export function matchesNewsFilters(item,filters){
  const day=newsDay(item.addedAt||item.publishedAt);
  return filters.priorities.includes(priorities.includes(item.priority)?item.priority:'ordinary')&&(!filters.from||(day&&day>=filters.from))&&(!filters.to||(day&&day<=filters.to));
}
export function activeFilterCount(filters){return (filters.priorities.length!==priorities.length?1:0)+(filters.from||filters.to?1:0)}
