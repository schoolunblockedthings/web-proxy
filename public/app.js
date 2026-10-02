const tabsEl=document.getElementById("tabs");
const viewport=document.querySelector(".viewport");
const homePage=document.getElementById("homePage");
const address=document.getElementById("address");
const addressForm=document.getElementById("addressForm");
const homeForm=document.getElementById("homeForm");
const homeInput=document.getElementById("homeInput");
const error=document.getElementById("error");
const KEY="proxy-theme";

let tabs=[];
let active=0;

function current(){ return tabs[active]; }

function normalize(value){
  value=String(value||"").trim();
  if(!value) return null;
  if(!/^https?:\/\//i.test(value)) value="https://"+value;
  try{
    const u=new URL(value);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  }catch(e){ return null; }
}

function proxyUrl(url){
  return "/proxy?url="+encodeURIComponent(url);
}

function showError(message){
  homePage.hidden=false;
  error.textContent=message;
  error.hidden=false;
}

function clearError(){
  error.hidden=true;
  error.textContent="";
}

function recoverEscapedNavigation(tab, frame){
  if(!tab || !tab.url || !frame) return false;
  try{
    const frameUrl=new URL(frame.contentWindow.location.href);
    const appOrigin=window.location.origin;

    if(frameUrl.origin!==appOrigin || frameUrl.pathname==="/proxy") return false;

    const currentTarget=new URL(tab.url);
    const escapedPath=frameUrl.pathname+frameUrl.search+frameUrl.hash;
    const target=new URL(escapedPath,currentTarget.origin).href;

    if(target===tab.url || tab.recovering) return false;

    tab.recovering=true;
    tab.history=tab.history.slice(0,tab.pos+1);
    tab.history.push(target);
    tab.pos++;
    tab.url=target;
    tab.title=new URL(target).hostname;
    tab.icon=null;
    address.value=target;
    frame.src=proxyUrl(target);

    setTimeout(function(){
      tab.recovering=false;
    },1000);

    return true;
  }catch(e){
    return false;
  }
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
      const title=frame.contentDocument && frame.contentDocument.title;
      if(title && title.trim()){
        tab.title=title.trim().slice(0,80);
      }else if(tab.url){
        tab.title=new URL(tab.url).hostname;
      }
      const icon=frame.contentDocument && frame.contentDocument.querySelector("link[rel~='icon']");
      if(icon && icon.href) tab.icon=icon.href;
    }catch(e){}
    if(current()===tab) renderTabs();
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
    el.title=tab.url || "New Tab";
    el.innerHTML='<span class="tab-favicon"></span><span class="tab-title"></span><button class="tab-close" type="button" aria-label="Close tab">×</button>';
    el.querySelector(".tab-title").textContent=tab.title;
    const favicon=el.querySelector(".tab-favicon");
    favicon.textContent=tab.icon?"":"🌐";
    if(tab.icon){
      favicon.textContent="";
      favicon.style.backgroundImage="url("+JSON.stringify(tab.icon)+")";
      favicon.classList.add("has-icon");
    }
    el.addEventListener("click",function(){
      if(active!==index){
        active=index;
        showCurrent();
      }
    });
    el.addEventListener("auxclick",function(e){
      if(e.button===1){
        e.preventDefault();
        closeTab(index);
      }
    });
    el.querySelector(".tab-close").addEventListener("click",function(e){
      e.stopPropagation();
      closeTab(index);
    });
    tabsEl.appendChild(el);
  });
}

function makeTab(){
  const tab={url:null,title:"New Tab",history:[],pos:-1,icon:null,frame:null,recovering:false};
  tabs.push(tab);
  createFrame(tab);
  active=tabs.length-1;
  renderTabs();
  showCurrent();
}

function closeTab(index){
  const wasActive=index===active;
  const tab=tabs[index];
  if(tab && tab.frame) tab.frame.remove();

  if(tabs.length===1){
    tabs=[];
    makeTab();
    return;
  }

  tabs.splice(index,1);
  if(index<active) active--;
  else if(wasActive) active=Math.min(index,tabs.length-1);
  renderTabs();
  showCurrent();
}

function openUrl(url,push){
  const tab=current();
  if(!tab) return;

  if(!url){
    tab.url=null;
    tab.title="New Tab";
    tab.icon=null;
    tab.history=[];
    tab.pos=-1;
    tab.recovering=false;
    address.value="";
    if(tab.frame) tab.frame.hidden=true;
    homePage.hidden=false;
    clearError();
    renderTabs();
    return;
  }

  if(push){
    tab.history=tab.history.slice(0,tab.pos+1);
    tab.history.push(url);
    tab.pos++;
  }

  tab.url=url;
  tab.title=new URL(url).hostname;
  tab.icon=null;
  tab.recovering=false;
  address.value=url;
  homePage.hidden=true;
  clearError();
  if(tab.frame){
    tab.frame.hidden=false;
    tab.frame.src=proxyUrl(url);
  }
  renderTabs();
}

function navigate(value){
  const url=normalize(value);
  if(!url){
    showError("Enter a valid web address, such as example.com.");
    return;
  }
  openUrl(url,true);
}

function showCurrent(){
  const tab=current();
  tabs.forEach(function(item,index){
    if(item.frame) item.frame.hidden=index!==active;
  });

  if(tab && tab.url){
    address.value=tab.url;
    homePage.hidden=true;
    clearError();
    if(tab.frame) tab.frame.hidden=false;
  }else if(tab){
    openUrl(null,false);
  }
  renderTabs();
}

addressForm.addEventListener("submit",function(e){
  e.preventDefault();
  navigate(address.value);
});

homeForm.addEventListener("submit",function(e){
  e.preventDefault();
  navigate(homeInput.value);
});

document.getElementById("back").addEventListener("click",function(){
  const tab=current();
  if(tab && tab.pos>0){
    tab.pos--;
    tab.url=tab.history[tab.pos];
    tab.title=new URL(tab.url).hostname;
    tab.icon=null;
    tab.recovering=false;
    if(tab.frame) tab.frame.src=proxyUrl(tab.url);
    showCurrent();
  }
});

document.getElementById("forward").addEventListener("click",function(){
  const tab=current();
  if(tab && tab.pos<tab.history.length-1){
    tab.pos++;
    tab.url=tab.history[tab.pos];
    tab.title=new URL(tab.url).hostname;
    tab.icon=null;
    tab.recovering=false;
    if(tab.frame) tab.frame.src=proxyUrl(tab.url);
    showCurrent();
  }
});

document.getElementById("reload").addEventListener("click",function(){
  const tab=current();
  if(tab && tab.frame && tab.url) tab.frame.src=tab.frame.src;
});

document.getElementById("home").addEventListener("click",function(){
  openUrl(null,false);
});

document.getElementById("newTab").addEventListener("click",makeTab);

document.getElementById("theme").addEventListener("click",function(){
  const light=!document.body.classList.contains("light");
  document.body.classList.toggle("light",light);
  document.getElementById("theme").textContent=light?"☾":"☀";
  localStorage.setItem(KEY,light?"light":"dark");
});

try{
  const saved=localStorage.getItem(KEY)==="light";
  document.body.classList.toggle("light",saved);
  document.getElementById("theme").textContent=saved?"☾":"☀";
}catch(e){}

makeTab();
