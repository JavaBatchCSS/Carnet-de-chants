with open('app.js', 'a', encoding='utf-8') as f:
    f.write('''

// --- Navigation Top Bar Logic ---
!function(){
  var w=document.querySelector(".wrap-nav"),b=document.querySelector(".bar");
  if(!w||!b)return;
  var cur=(w.getAttribute("data-current-tab")||new URLSearchParams(location.search).get("tab")||"documentation").toLowerCase();
  if(!b.querySelector(".tab.active"))
    b.querySelector(".tab[data-tab='"+cur+"']")?.classList.add("active");
  function fit(){
    b.style.transform="scale(1)";
    var pw=(w.parentElement||w).clientWidth||w.clientWidth;
    var s=Math.min(1,pw/b.scrollWidth);
    b.style.transform="scale("+s.toFixed(4)+")";
    w.style.height=Math.ceil(b.offsetHeight*s)+"px";
  }
  fit();
  window.addEventListener("resize",fit);
  if(window.ResizeObserver)new ResizeObserver(fit).observe(w.parentElement||w);
}();
''')
