const tabsEl=document.getElementById("tabs");
const frame=document.getElementById("frame");
const homePage=document.getElementById("homePage");
const address=document.getElementById("address");
const addressForm=document.getElementById("addressForm");
const homeForm=document.getElementById("homeForm");
const homeInput=document.getElementById("homeInput");
const error=document.getElementById("error");

let tabs=[];
let active=0;
const KEY="proxy-theme";

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
  frame.hidden=true;
  error.textContent=message;
  error.hidden=false;
}

function clearError(){
  error.hidden=true;
  error.textContent="";
}

function renderTabs(){
  tabsEl.innerHTML="";
  tabs.forEach(function(tab,index){
    const el=document.createElement("div");
    el.className="tab"+(index===active?" active":"");
    el.innerHTML='<span>🌐</span><span class="tab-title"></span><button class="tab-close" type="button">×</button>';
    el.querySelector(".tab-title").textContent=tab.title;
    el.addEventListener("click",function(){
      active=index;
      renderTabs();
      showCurrent();
    });
    el.querySelector(".tab-close").addEventListener("click",function(e){
      e.stopPropagation();
      closeTab(index);
    });
    tabsEl.appendChild(el);
  });
}

function makeTab(){
  tabs.push({url:null,title:"New Tab",history:[],pos:-1});
  active=tabs.length-1;
  renderTabs();
  showCurrent();
}

function closeTab(index){
  if(tabs.length===1){
    tabs[0]={url:null,title:"New Tab",history:[],pos:-1};
    active=0;
  }else{
    tabs.splice(index,1);
    active=Math.min(active,tabs.length-1);
  }
  renderTabs();
  showCurrent();
}

function openUrl(url,push){
  const tab=current();
  if(!url){
    tab.url=null;
    tab.title="New Tab";
    tab.history=[];
    tab.pos=-1;
    address.value="";
    frame.hidden=true;
    homePage.hidden=false;
    clearError();
    return;
  }

  if(push){
    tab.history=tab.history.slice(0,tab.pos+1);
    tab.history.push(url);
    tab.pos++;
  }

  tab.url=url;
  tab.title=new URL(url).hostname;
  address.value=url;
  homePage.hidden=true;
  frame.hidden=false;
  clearError();
  frame.src=proxyUrl(url);
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
  if(tab && tab.url){
    address.value=tab.url;
    homePage.hidden=true;
    frame.hidden=false;
    clearError();
    frame.src=proxyUrl(tab.url);
  }else{
    openUrl(null,false);
  }
}

addressForm.addEventListener("submit",function(e){
  e.preventDefault();
  e.stopPropagation();
  navigate(address.value);
});

homeForm.addEventListener("submit",function(e){
  e.preventDefault();
  e.stopPropagation();
  navigate(homeInput.value);
});

document.getElementById("back").addEventListener("click",function(){
  const tab=current();
  if(tab.pos>0){
    tab.pos--;
    tab.url=tab.history[tab.pos];
    showCurrent();
  }
});

document.getElementById("forward").addEventListener("click",function(){
  const tab=current();
  if(tab.pos<tab.history.length-1){
    tab.pos++;
    tab.url=tab.history[tab.pos];
    showCurrent();
  }
});

document.getElementById("reload").addEventListener("click",function(){
  const tab=current();
  if(tab.url) showCurrent();
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

frame.addEventListener("load",function(){
  if(current() && current().url) clearError();
});

frame.addEventListener("error",function(){
  showError("The proxy could not load this website.");
});

try{
  const saved=localStorage.getItem(KEY)==="light";
  document.body.classList.toggle("light",saved);
  document.getElementById("theme").textContent=saved?"☾":"☀";
}catch(e){}

makeTab();
