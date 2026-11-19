import assert from 'node:assert/strict';
import {parseRSS,buildCompanyMatcher,makeNews,cleanText,acceptedLanguage,articleKey} from './server/news-data.mjs';
import {classifyNewsPriority} from './dist/news-priority.js';
const companies=[
 {id:'MSTR',symbol:'MSTR',name:'Strategy Inc.',market:'US'},
 {id:'TGT',symbol:'TGT',name:'Target Corporation',market:'US'},
 {id:'CLIK',symbol:'CLIK',name:'Click Holdings Limited',market:'US'},
 {id:'IBM',symbol:'IBM',name:'International Business Machines Corporation',market:'US'},
 {id:'MOEX:SBER',symbol:'SBER',name:'Сбербанк',market:'RU'},
 {id:'F',symbol:'F',name:'Ford Motor Company',market:'US'},
 {id:'NDAQ',symbol:'NDAQ',name:'Nasdaq, Inc.',market:'US'},
 {id:'NBHC',symbol:'NBHC',name:'National Bank Holdings Corp',market:'US'},
 {id:'CR',symbol:'CR',name:'Crane Co',market:'US'},
 {id:'DOT',symbol:'DOT',name:'People Inc',market:'US'},
 {id:'CODX',symbol:'CODX',name:'Co-Diagnostics, Inc.',market:'US'},
 {id:'POWW',symbol:'POWW',name:'Outdoor Holding Co',market:'US'},
 {id:'PERF',symbol:'PERF',name:'Perfect Corp.',market:'US'},
 {id:'MMS',symbol:'MMS',name:'Maximus Inc.',market:'US'},
 {id:'IT',symbol:'IT',name:'Gartner Inc.',market:'US'},
 {id:'FGL',symbol:'FGL',name:'Founder Group Ltd',market:'US'},
 {id:'FRO',symbol:'FRO',name:'Frontline plc',market:'US'}
];
const match=buildCompanyMatcher(companies);
assert.deepEqual(match({title:'New strategy to target customers',summary:'Click here for more'},'US'),[]);
assert.deepEqual(match({title:'A new development',summary:'Click Holdings Limited (NASDAQ: CLIK)'},'US').map(c=>c.id),['CLIK']);
assert.deepEqual(match({title:'International Business Machines reports results',summary:''},'US').map(c=>c.id),['IBM']);
assert.deepEqual(match({title:'Дивиденды Сбербанка',summary:''},'RU').map(c=>c.id),['MOEX:SBER']);
assert.deepEqual(match({title:'F is a letter',summary:''},'US'),[]);
for(const title of ['Crane tires demand increases','Empowering people with disabilities','First National Bank Alaska announces leadership transition','Nasdaq and S&P hold gains'])assert.deepEqual(match({title,summary:''},'US'),[]);
for(const title of ['Wally Raises Funds for Cleanings & Diagnostics','Outdoor holiday lighting','Featuring Perfect Skin + Lashes','Maximus Partners Expands Leadership Team','Hexaware named in Gartner Magic Quadrant','Arch Lending Co-Founder explains mortgages','Abusix lanza Abusix Frontline'])assert.deepEqual(match({title,summary:''},'US'),[]);
assert.deepEqual(match({title:'Co-Diagnostics Reports Quarterly Results',summary:''},'US').map(c=>c.id),['CODX']);
assert.deepEqual(match({title:'Gartner Announces Results',summary:''},'US').map(c=>c.id),['IT']);
assert.deepEqual(match({title:'Nasdaq announces earnings',summary:'Nasdaq, Inc. (NASDAQ: NDAQ)'},'US').map(c=>c.id),['NDAQ']);
const translation='https://www.globenewswire.com/news-release/2026/10/07/3376747/0/fr/story.html';
assert.equal(acceptedLanguage({url:translation}),false);
assert.equal(articleKey({url:translation}),articleKey({url:translation.replace('/fr/','/en/')}));
const [row]=parseRSS('<rss><channel><item><title><![CDATA[Profit &amp; growth]]></title><description><![CDATA[<b>Up</b><script>alert(1)</script>]]></description><link>https://example.com/story</link><pubDate>Wed, 07 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>');
assert.equal(row.title,'Profit & growth');assert.equal(row.summary,'Up');
assert.equal(cleanText('&lt;b&gt;Text&lt;/b&gt;'),'Text');
const now=new Date('2026-10-07T12:00:00Z');
const a=makeNews(row,{name:'Test'},companies[3],null,now);
assert.equal(a.impact,'neutral');assert.equal(a.addedAt,now.toISOString());
assert.equal(makeNews(row,{name:'Test'},companies[3],a,new Date('2026-10-08')).addedAt,a.addedAt);
assert.equal(makeNews({...row,url:'javascript:alert(1)'},{name:'Test'},companies[0],null,now),null);
assert.equal(makeNews({...row,publishedAt:'2030-01-01'},{name:'Test'},companies[0],null,now),null);
const sampleTime = '2026-11-18T21:00:00Z';
const classify = (title, extra={})=>classifyNewsPriority({title,publishedAt:sampleTime,...extra});
for (const [title,priority] of [
  ['Company receives Nasdaq delisting notice', 'urgent'],
  ['Об ограничении кодов расчетов по акциям ПАО EUTR с 19 ноября 2026 года', 'urgent'],
  ['Об ограничении кодов расчетов по акциям ПАО EUTR с 27 ноября 2026 года', 'important'],
  ['Nasdaq announces trading halt effective November 30, 2026', 'important'],
  ['Company misses interest payment', 'urgent'],
  ['Компания подала заявление о банкротстве', 'urgent'],
  ['Exchange announces trading halt lifted', 'important'],
  ['Investor alert: risk of trading halt and lead plaintiff deadline', 'ordinary'],
  ['Company reports first quarter financial results', 'important'],
  ['Company announces fiscal 2027 earnings release date', 'ordinary'],
  ['Company to host third quarter earnings conference call on Tuesday', 'ordinary'],
  ['Company announces first quarter earnings conference call', 'ordinary'],
  ['Компания увеличила квартальные дивиденды', 'important'],
  ['Company announces new product launch', 'ordinary'],
]) {
  const result=classify(title);
  assert.equal(result.priority,priority,title);
  assert(result.priorityNote,title);
}
assert.equal(classify('Компания опубликует финансовые результаты', {impact:'positive'}).priority,'ordinary');
assert.equal(classify('Компания отчиталась', {summary:'Чистая прибыль снизилась на 21%.'}).priority,'important');
const urgent = makeNews({...row,title:'Company receives Nasdaq delisting notice'},{name:'Test'},companies[0],null,now);
assert.equal(urgent.priority,'urgent');assert.equal(urgent.impact,'neutral');
console.log('PASS news source parsing, company matching, date stability, safe links and evidence-based priority');
