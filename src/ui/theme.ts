// Light or dark: follows the system unless the viewer picks one, and the pick is remembered in this browser.
type Choice='system'|'dark'|'light';
const KEY='mini-reading-theme',NEXT:Record<Choice,Choice>={system:'dark',dark:'light',light:'system'};
const LABEL:Record<Choice,[string,string]>={system:['◐','Colours follow your system'],dark:['☾','Dark colours'],light:['☀','Light colours']};
const query=()=>globalThis.matchMedia?.('(prefers-color-scheme: dark)');
function saved():Choice{try{const v=localStorage.getItem(KEY);return v==='dark'||v==='light'?v:'system';}catch{return 'system';}}
function save(choice:Choice){try{if(choice==='system')localStorage.removeItem(KEY);else localStorage.setItem(KEY,choice);}catch{/* private mode: the choice lasts for this visit */}}
let choice:Choice='system';
/** Whether the page is showing dark colours right now. */
export function isDark(){return choice==='dark'||(choice==='system'&&query()?.matches===true);}
/** Calls `listener` whenever the colours flip, whether from the system or the button. */
export function onThemeChange(listener:()=>void){query()?.addEventListener('change',()=>{if(choice==='system')listener();});document.addEventListener('themechange',listener);}
function apply(button:HTMLElement){
 if(choice==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=choice;
 const [icon,label]=LABEL[choice];button.textContent=icon;button.title=`${label} · change`;button.setAttribute('aria-label',`${label}. Change colours`);
}
/** Applies the remembered choice and wires the button that cycles system, dark and light. */
export function connectTheme(button:HTMLElement){
 choice=saved();apply(button);
 button.addEventListener('click',()=>{const wasDark=isDark();choice=NEXT[choice];save(choice);apply(button);if(isDark()!==wasDark)document.dispatchEvent(new Event('themechange'));});
}
