const tabsEl=document.getElementById("tabs");
const viewport=document.querySelector(".viewport");
const homePage=document.getElementById("homePage");
const address=document.getElementById("address");
const addressForm=document.getElementById("addressForm");
const homeForm=document.getElementById("homeForm");
const homeInput=document.getElementById("homeInput");
const error=document.getElementById("error");
const bookmarksBar=document.getElementById("bookmarksBar");
const homeShortcuts=document.getElementById("homeShortcuts");
const browserMenu=document.getElementById("browserMenu");
const tabMenu=document.getElementById("tabMenu");
const KEY="proxy-theme";
const SESSION_KEY="proxy-session-v2";
const BOOKMARKS_KEY="proxy-bookmarks-v2";
const CLOSED_KEY="proxy-closed-tabs-v2";
const ZOOM_KEY="proxy-zoom";

let tabs=[];
let active=0;
let closedTabs=[];
let bookmarks=[];
let contextTabIndex=-1;
let zoom=100;

function current(){ return tabs[active]; }

function normalize(value){
  value=String(value||"").trim();
  if(!value) return null;
  if(!/^https?:\/\//i.test(value)){
    if(/^localhost(?::\d+)?(?:\/|$)/i.test(value) || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/.test(value)){
      value="http://"+value;
    }else if(/^https?:/i.test(value)){
      return null;
    }else{
      const looksLikeHost=/^[^\s/?#]+\.[^\s/?#]+(?:[/?#]|$)/.test(value);
      value=looksLikeHost ? "https://"+value : "https://html.duckduckgo.com/html/?q="+encodeURIComponent(value);
    }
  }
  try{
    const u=new URL(value);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  }catch(e){ return null; }
}

function proxyUrl(url){ return "/proxy?url="+encodeURIComponent(url); }

function showError(message){
  homePage.hidden=false;
  error.textContent=message;
  error.hidden=false;
}
function clearError(){ error.hidden=true; error.textContent=""; }

function persist(){
  try{
    localStorage.setItem(SESSION_KEY,JSON.stringify({
      active,
      tabs:tabs.map(t=>({url:t.url,title:t.title,history:t.history,pos:t.pos,icon:t.icon}))
    }));
    localStorage.setItem(BOOKMARKS_KEY,JSON.stringify(bookmarks));
    localStorage.setItem(CLOSED_KEY,JSON.stringify(closedTabs.slice(-12)));
    localStorage.setItem(ZOOM_KEY,String(zoom));
  }catch(e){}
}

function loadSaved(){
  try{
    bookmarks=JSON.parse(localStorage.getItem(BOOKMARKS_KEY)||"[]").filter(x=>x&&x.url);
    closedTabs=JSON.parse(localStorage.getItem(CLOSED_KEY)||"[]").filter(x=>x&&x.url);
    const savedZoom=parseInt(localStorage.getItem(ZOOM_KEY)||"100",10);
    if([75,80,90,100,110,125,150].includes(savedZoom)) zoom=savedZoom;
    renderBookmarks();

    const session=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");
    if(session&&Array.isArray(session.tabs)&&session.tabs.length){
      session.tabs.slice(0,20).forEach(data=>{
        const tab={url:data.url||null,title:data.title||"New Tab",history:Array.isArray(data.history)?data.history:[],pos:Number.isInteger(data.pos)?data.pos:-1,icon:data.icon||null,frame:null,recovering:false};
        tabs.push(tab); createFrame(tab);
      });
      active=Math.min(Math.max(0,session.active||0),tabs.length-1);
      return true;
    }
  }catch(e){}
  return false;
}

function recoverEscapedNavigation(tab,frame){
  if(!tab||!tab.url||!frame) return false;
  try{
    const frameUrl=new URL(frame.contentWindow.location.href);
    const appOrigin=window.location.origin;
    if(frameUrl.origin!==appOrigin||frameUrl.pathname==="/proxy") return false;
    const currentTarget=new URL(tab.url);
    const escapedPath=frameUrl.pathname+frameUrl.search+frameUrl.hash;
    const target=new URL(escapedPath,currentTarget.origin).href;
    if(target===tab.url||tab.recovering) return false;
    tab.recovering=true;
    tab.history=tab.history.slice(0,tab.pos+1);
    tab.history.push(target); tab.pos++;
    tab.url=target; tab.title=new URL(target).hostname; tab.icon=null;
    address.value=target; frame.src=proxyUrl(target);
    setTimeout(()=>{tab.recovering=false;persist()},1000);
    return true;
  }catch(e){ return false; }
}

function applyZoom(frame){
  if(!frame) return;
  try{
    const doc=frame.contentDocument;
    if(doc&&doc.documentElement){
      doc.documentElement.style.zoom=(zoom/100);
      doc.documentElement.dataset.proxyZoom=String(zoom);
    }
  }catch(e){}
}

function createFrame(tab){
  const frame=document.createElement("iframe");
  frame.className="tab-frame";
  frame.title="Proxy browser";
  frame.hidden=true;
  frame.addEventListener("load",function(){
    if(!tabs.includes(tab)) return;
    if(recoverEscapedNavigation(tab,frame)){
      if(current()===tab) renderTabs();
      return;
    }
    try{
      const title=frame.contentDocument&&frame.contentDocument.title;
      if(title&&title.trim()) tab.title=title.trim().slice(0,80);
      else if(tab.url) tab.title=new URL(tab.url).hostname;
      const icon=frame.contentDocument&&frame.contentDocument.querySelector("link[rel~='icon']");
      if(icon&&icon.href) tab.icon=icon.href;
      applyZoom(frame);
    }catch(e){}
    if(current()===tab) renderTabs();
    persist();
  });
  frame.addEventListener("error",function(){
    if(current()===tab) showError("The proxy could not load this website.");
  });
  viewport.appendChild(frame);
  tab.frame=frame;
  return frame;
}

function renderTabs(){
  tabsEl.innerHTML="";
  tabs.forEach(function(tab,index){
    const el=document.createElement("div");
    el.className="tab"+(index===active?" active":"");
    el.setAttribute("role","tab");
    el.setAttribute("aria-selected",index===active?"true":"false");
    el.title=tab.url||"New Tab";
    el.innerHTML='<span class="tab-favicon"></span><span class="tab-title"></span><button class="tab-close" type="button" aria-label="Close tab">×</button>';
    el.querySelector(".tab-title").textContent=tab.title;
    const favicon=el.querySelector(".tab-favicon");
    favicon.textContent=tab.icon?"":"🌐";
    if(tab.icon){
      favicon.textContent="";
      favicon.style.backgroundImage="url("+JSON.stringify(tab.icon)+")";
      favicon.classList.add("has-icon");
    }
    el.addEventListener("click",()=>{ if(active!==index){active=index;showCurrent();} });
    el.addEventListener("auxclick",e=>{if(e.button===1){e.preventDefault();closeTab(index);}});
    el.addEventListener("contextmenu",e=>{
      e.preventDefault(); contextTabIndex=index; positionMenu(tabMenu,e.clientX,e.clientY);
    });
    el.querySelector(".tab-close").addEventListener("click",e=>{e.stopPropagation();closeTab(index);});
    tabsEl.appendChild(el);
  });
}

function positionMenu(menu,x,y){
  menu.hidden=false;
  menu.style.left=Math.min(x,window.innerWidth-230)+"px";
  menu.style.top=Math.min(y,window.innerHeight-300)+"px";
}

function makeTab(insertAfterActive=true){
  const tab={url:null,title:"New Tab",history:[],pos:-1,icon:null,frame:null,recovering:false};
  const index=insertAfterActive?active+1:tabs.length;
  tabs.splice(index,0,tab);
  createFrame(tab);
  active=index;
  renderTabs(); showCurrent(); persist();
}

function duplicateTab(index=active){
  const source=tabs[index];
  if(!source) return;
  const tab={url:source.url,title:source.title,history:source.history.slice(),pos:source.pos,icon:source.icon,frame:null,recovering:false};
  tabs.splice(index+1,0,tab);
  createFrame(tab);
  active=index+1;
  renderTabs(); showCurrent(); persist();
}

function closeTab(index){
  const wasActive=index===active;
  const tab=tabs[index];
  if(!tab) return;
  if(tab.url) closedTabs.push({url:tab.url,title:tab.title,history:tab.history,pos:tab.pos,icon:tab.icon});
  if(tab.frame) tab.frame.remove();
  if(tabs.length===1){
    tabs=[]; makeTab(false); return;
  }
  tabs.splice(index,1);
  if(index<active) active--;
  else if(wasActive) active=Math.min(index,tabs.length-1);
  renderTabs(); showCurrent(); persist();
}

function reopenClosed(){
  const data=closedTabs.pop();
  if(!data) return;
  const tab={url:data.url,title:data.title||new URL(data.url).hostname,history:data.history||[data.url],pos:Number.isInteger(data.pos)?data.pos:(data.history?.length-1||0),icon:data.icon||null,frame:null,recovering:false};
  tabs.splice(active+1,0,tab);
  createFrame(tab); active++;
  renderTabs(); showCurrent(); persist();
}

function openUrl(url,push){
  const tab=current();
  if(!tab) return;
  if(!url){
    tab.url=null;tab.title="New Tab";tab.icon=null;tab.history=[];tab.pos=-1;tab.recovering=false;
    address.value=""; if(tab.frame) tab.frame.hidden=true; homePage.hidden=false; clearError(); renderTabs(); persist(); return;
  }
  if(push){tab.history=tab.history.slice(0,tab.pos+1);tab.history.push(url);tab.pos++;}
  tab.url=url;tab.title=new URL(url).hostname;tab.icon=null;tab.recovering=false;
  address.value=url;homePage.hidden=true;clearError();
  if(tab.frame){tab.frame.hidden=false;tab.frame.src=proxyUrl(url);}
  renderTabs();persist();
}

function navigate(value){
  const url=normalize(value);
  if(!url){showError("Enter a valid web address or search term.");return;}
  openUrl(url,true);
}

function showCurrent(){
  const tab=current();
  tabs.forEach((item,index)=>{if(item.frame)item.frame.hidden=index!==active;});
  if(tab&&tab.url){
    address.value=tab.url;homePage.hidden=true;clearError();if(tab.frame)tab.frame.hidden=false;
  }else if(tab){openUrl(null,false);}
  renderTabs();persist();
}

function isBookmarked(url){return bookmarks.some(b=>b.url===url);}
function toggleBookmark(){
  const tab=current(); if(!tab||!tab.url)return;
  const existing=bookmarks.findIndex(b=>b.url===tab.url);
  if(existing>=0) bookmarks.splice(existing,1);
  else bookmarks.push({url:tab.url,title:tab.title||new URL(tab.url).hostname});
  renderBookmarks();renderBookmarkButton();persist();
}
function renderBookmarkButton(){
  const b=document.getElementById("bookmark");
  if(!b)return;
  const marked=current()&&current().url&&isBookmarked(current().url);
  b.textContent=marked?"★":"☆"; b.title=marked?"Remove bookmark":"Bookmark this page";
}
function renderBookmarks(){
  bookmarksBar.innerHTML="";
  if(!bookmarks.length){bookmarksBar.hidden=true;renderBookmarkButton();renderHomeShortcuts();return;}
  bookmarksBar.hidden=false;
  bookmarks.forEach((b,i)=>{
    const wrap=document.createElement("div");wrap.className="bookmark-item";
    const button=document.createElement("button");button.type="button";button.textContent=b.title||new URL(b.url).hostname;button.title=b.url;
    button.addEventListener("click",()=>openUrl(b.url,true));
    const remove=document.createElement("button");remove.type="button";remove.className="bookmark-remove";remove.textContent="×";remove.title="Remove bookmark";
    remove.addEventListener("click",e=>{e.stopPropagation();bookmarks.splice(i,1);renderBookmarks();persist();});
    wrap.append(button,remove);bookmarksBar.appendChild(wrap);
  });
  renderBookmarkButton();renderHomeShortcuts();
}
function renderHomeShortcuts(){
  if(!homeShortcuts)return;
  homeShortcuts.innerHTML="";
  bookmarks.slice(0,8).forEach(b=>{
    const a=document.createElement("button");a.type="button";a.className="home-shortcut";a.textContent=b.title||new URL(b.url).hostname;
    a.addEventListener("click",()=>openUrl(b.url,true));homeShortcuts.appendChild(a);
  });
}

function setMenuVisible(menu,visible){
  menu.hidden=!visible;
  if(!visible)menu.style.left=menu.style.top="";
}
function closeMenus(){setMenuVisible(browserMenu,false);setMenuVisible(tabMenu,false);}

addressForm.addEventListener("submit",e=>{e.preventDefault();navigate(address.value);});
homeForm.addEventListener("submit",e=>{e.preventDefault();navigate(homeInput.value);});
document.getElementById("back").addEventListener("click",()=>{
  const tab=current();if(tab&&tab.pos>0){tab.pos--;tab.url=tab.history[tab.pos];tab.title=new URL(tab.url).hostname;tab.icon=null;tab.recovering=false;if(tab.frame)tab.frame.src=proxyUrl(tab.url);showCurrent();}
});
document.getElementById("forward").addEventListener("click",()=>{
  const tab=current();if(tab&&tab.pos<tab.history.length-1){tab.pos++;tab.url=tab.history[tab.pos];tab.title=new URL(tab.url).hostname;tab.icon=null;tab.recovering=false;if(tab.frame)tab.frame.src=proxyUrl(tab.url);showCurrent();}
});
document.getElementById("reload").addEventListener("click",()=>{
  const tab=current();if(tab&&tab.frame&&tab.url)tab.frame.src=tab.frame.src;
});
document.getElementById("home").addEventListener("click",()=>openUrl(null,false));
document.getElementById("newTab").addEventListener("click",()=>makeTab(true));
document.getElementById("bookmark").addEventListener("click",toggleBookmark);
document.getElementById("menuButton").addEventListener("click",e=>{
  e.stopPropagation();closeMenus();const r=e.currentTarget.getBoundingClientRect();positionMenu(browserMenu,r.left-205,r.bottom+6);
});
document.getElementById("theme").addEventListener("click",()=>{
  const light=!document.body.classList.contains("light");
  document.body.classList.toggle("light",light);document.getElementById("theme").textContent=light?"☾":"☀";
  localStorage.setItem(KEY,light?"light":"dark");
});

browserMenu.addEventListener("click",e=>{
  const action=e.target.closest("button")?.dataset.action;if(!action)return;
  if(action==="new")makeTab(true);
  if(action==="duplicate")duplicateTab();
  if(action==="reopen")reopenClosed();
  if(action==="bookmarks"){bookmarksBar.hidden=!bookmarksBar.hidden;}
  if(action==="fullscreen"){
    if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();
  }
  if(action==="zoom-in"){zoom=Math.min(150,zoom+10);applyZoom(current()?.frame);}
  if(action==="zoom-out"){zoom=Math.max(75,zoom-10);applyZoom(current()?.frame);}
  if(action==="zoom-reset"){zoom=100;applyZoom(current()?.frame);}
  if(action==="clear-session"){localStorage.removeItem(SESSION_KEY);localStorage.removeItem(CLOSED_KEY);closedTabs=[];}
  persist();closeMenus();
});
tabMenu.addEventListener("click",e=>{
  const action=e.target.closest("button")?.dataset.action;if(!action)return;
  const i=contextTabIndex;
  if(action==="duplicate")duplicateTab(i);
  if(action==="close")closeTab(i);
  if(action==="reload"&&tabs[i]?.frame)tabs[i].frame.src=tabs[i].frame.src;
  if(action==="close-others"){
    const keep=tabs[i];
    tabs.forEach((t,n)=>{if(n!==i)t.frame?.remove();});
    tabs=[keep];active=0;showCurrent();
  }
  closeMenus();persist();
});
document.addEventListener("click",e=>{if(!e.target.closest(".browser-menu")&&!e.target.closest("#menuButton"))closeMenus();});
document.addEventListener("keydown",e=>{
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&e.key.toLowerCase()==="l"){e.preventDefault();address.focus();address.select();return;}
  if(mod&&e.key.toLowerCase()==="t"){e.preventDefault();makeTab(true);return;}
  if(mod&&e.key.toLowerCase()==="w"){e.preventDefault();closeTab(active);return;}
  if(mod&&e.shiftKey&&e.key.toLowerCase()==="t"){e.preventDefault();reopenClosed();return;}
  if(mod&&e.key.toLowerCase()==="r"){e.preventDefault();document.getElementById("reload").click();return;}
  if(mod&&e.shiftKey&&e.key.toLowerCase()==="b"){e.preventDefault();bookmarksBar.hidden=!bookmarksBar.hidden;return;}
  if(mod&&e.key==="Enter"){e.preventDefault();navigate(address.value);return;}
  if(e.key==="Escape"){closeMenus();address.blur();return;}
  if(mod&&e.key==="Tab"){e.preventDefault();active=(active+(e.shiftKey?-1:1)+tabs.length)%tabs.length;showCurrent();return;}
});

try{
  const saved=localStorage.getItem(KEY)==="light";
  document.body.classList.toggle("light",saved);
  document.getElementById("theme").textContent=saved?"☾":"☀";
}catch(e){}

if(!loadSaved()){makeTab(false);}
else{renderTabs();showCurrent();renderBookmarks();renderBookmarkButton();}
