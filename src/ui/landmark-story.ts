import {escape} from './shell';
import {LANDMARK_STORIES,STORIES_CHECKED} from '../../shared/landmark-stories';
const checked=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
/** The landmark's history as HTML, each fact followed by numbered links to its sources. Empty when no story exists. */
export function storyHtml(id:string){
 const story=LANDMARK_STORIES[id];if(!story)return '';
 const number=(sourceId:string)=>story.sources.findIndex(s=>s.id===sourceId)+1;
 const facts=story.facts.map(f=>`<li>${escape(f.text)}&nbsp;${f.sources.map(s=>`<a class="story-cite" href="#story-source-${escape(id)}-${number(s)}" aria-label="Source ${number(s)}">[${number(s)}]</a>`).join('')}</li>`).join('');
 const sources=story.sources.map((s,i)=>`<li id="story-source-${escape(id)}-${i+1}"><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a> <small>${escape(s.publisher)}</small></li>`).join('');
 return `<section class="landmark-story" aria-label="History"><h3>History</h3><ul class="story-facts">${facts}</ul><h3>Sources</h3><ol class="story-sources">${sources}</ol><small class="story-checked">Sources checked ${checked.format(Date.parse(STORIES_CHECKED))}.</small></section>`;
}
