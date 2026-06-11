/* ============================================================
   STUDIO v3 — interactions (scarcity edition)
   reveal · cursor · header · magnetic only. No content-dependent JS.
   ============================================================ */
(function(){
  "use strict";
  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;
  const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* static screenshot hook */
  if(/[?&]static=1/.test(location.search)){
    document.documentElement.style.scrollBehavior="auto";
    document.body.classList.add("static");
    const ym=location.search.match(/[?&]y=(\d+)/);
    if(ym){const y=+ym[1];const go=()=>scrollTo(0,y);go();setTimeout(go,120);addEventListener("load",go);}
  }
  const isStatic = document.body.classList.contains("static");

  /* ---------- reveal (IO + scroll fallback) ---------- */
  const reveals=[...document.querySelectorAll(".reveal")];
  const showInView=()=>{
    const vh=innerHeight||document.documentElement.clientHeight;
    for(let i=reveals.length-1;i>=0;i--){
      const el=reveals[i],r=el.getBoundingClientRect();
      if(r.top<vh*0.9 && r.bottom>0){el.classList.add("in");reveals.splice(i,1);}
    }
  };
  if("IntersectionObserver" in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}}),{threshold:.12,rootMargin:"0px 0px -8% 0px"});
    reveals.forEach(el=>io.observe(el));
  }
  showInView();requestAnimationFrame(showInView);
  addEventListener("scroll",showInView,{passive:true});addEventListener("load",showInView);

  /* ---------- custom cursor ---------- */
  if(fine && !reduce && !isStatic){
    document.body.classList.add("has-cursor");
    const dot=document.createElement("div"),ring=document.createElement("div");
    dot.className="cur-dot";ring.className="cur-ring";ring.innerHTML='<span class="cl"></span>';
    document.body.append(dot,ring);
    let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
    addEventListener("mousemove",e=>{mx=e.clientX;my=e.clientY;dot.style.transform=`translate(${mx}px,${my}px) translate(-50%,-50%)`;});
    (function loop(){rx+=(mx-rx)*.16;ry+=(my-ry)*.16;ring.style.transform=`translate(${rx}px,${ry}px) translate(-50%,-50%)`;requestAnimationFrame(loop);})();
    const sel="a,button,.spec,.concept,.step,image-slot";
    document.addEventListener("mouseover",e=>{const t=e.target.closest(sel);if(!t)return;const l=t.getAttribute("data-cursor");if(l){document.body.classList.add("cur-view");ring.querySelector(".cl").textContent=l;}else document.body.classList.add("cur-hover");});
    document.addEventListener("mouseout",e=>{if(!e.target.closest(sel))return;document.body.classList.remove("cur-hover","cur-view");});
  }

  /* ---------- header ---------- */
  const head=document.querySelector(".head");
  if(head){const s=()=>head.classList.toggle("scrolled",scrollY>40);s();addEventListener("scroll",s,{passive:true});}

  /* ---------- parallax (calm, scroll-based) ---------- */
  if(!reduce && !isStatic){
    const items=[...document.querySelectorAll("[data-parallax]")].map(el=>({el,sp:parseFloat(el.getAttribute("data-parallax"))||.1}));
    if(items.length){
      let tick=false;
      const apply=()=>{const vh=innerHeight;items.forEach(({el,sp})=>{const r=el.getBoundingClientRect();const c=r.top+r.height/2-vh/2;el.style.transform=`translate3d(0,${(-c*sp).toFixed(2)}px,0)`;});tick=false;};
      addEventListener("scroll",()=>{if(!tick){tick=true;requestAnimationFrame(apply);}},{passive:true});apply();
    }
  }

  /* ---------- magnetic ---------- */
  if(fine && !reduce && !isStatic){
    document.querySelectorAll("[data-magnetic]").forEach(el=>{
      el.addEventListener("mousemove",e=>{const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.28}px,${(e.clientY-r.top-r.height/2)*.34}px)`;});
      el.addEventListener("mouseleave",()=>{el.style.transform="";});
    });
  }

  /* ---------- selected-work hover index → floating preview ---------- */
  const ip=document.querySelector(".idx-preview");
  if(ip && fine && !reduce && !isStatic){
    const gx=ip.querySelector(".gx");
    const rows=[...document.querySelectorAll(".idx-row")];
    let px=innerWidth/2,py=innerHeight/2,cx=px,cy=py,raf=0,active=false;
    const loop=()=>{cx+=(px-cx)*.14;cy+=(py-cy)*.14;ip.style.left=cx+"px";ip.style.top=cy+"px";raf=active?requestAnimationFrame(loop):0;};
    rows.forEach(r=>{
      r.addEventListener("mouseenter",()=>{gx.className="gx "+(r.getAttribute("data-cover")||"gx-a");ip.classList.add("on");if(!active){active=true;loop();}});
      r.addEventListener("mouseleave",()=>{ip.classList.remove("on");active=false;});
    });
    addEventListener("mousemove",e=>{px=e.clientX+38;py=e.clientY;},{passive:true});
  }

  document.querySelectorAll("[data-year]").forEach(el=>el.textContent=new Date().getFullYear());
})();
