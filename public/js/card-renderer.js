// EO_CARD — canvas renderer used ONLY by the admin Studio (/admin/content-generator).
// It draws a design onto a canvas so you can download it as a PNG / ZIP. The public site does not use it:
// blog and content thumbnails are real image files.
(function(){
let W=1080,SIDE=false,SC=1;
const PN=["Navy","Green","Teal","Magenta","Amber","Red","Purple","Slate","Gold","Rose"];
const PAL=[["#0d2a6b","#1b9bb0","#eef5fc","#0d2a6b"],["#0f5132","#2e9e6b","#eefaf3","#0b3d28"],["#0e5c5a","#f2a33a","#ecf8f7","#0b3b3a"],["#7a1450","#ec6aa6","#fdeef6","#4a0b30"],["#8a4b00","#f2a33a","#fff6e5","#4a2800"],["#a5121f","#f26b6b","#fdeeee","#5a0b12"],["#4b2a8a","#8f6fe0","#f3eefd","#2d1a57"],["#1f2937","#10b981","#f1f5f9","#111827"],["#6b4e00","#e0b030","#fff9e0","#3d2c00"],["#9d174d","#fb923c","#fff1f2","#4c0519"]];
const STY=["Inset bar","Full bar","Framed","Badge","Light"];
const PC=["#1f6fc9","#2e9e6b","#ef8a2a","#8a5cc9","#1aa3a0","#d6455d"];
const FM={sq:[1080,1080],port:[1080,1350],a4:[1080,1527],story:[1080,1920],land:[1920,1080],yt:[1280,720],fb:[1200,630],thumb:[1200,630]};
const NB_BASE="/assets/narrators/";
let S,x,H=1080,D=0,VT={k:1,ox:0},R=[],NB=null,QB=null,LB=null,SK=null,BASE="https://ezra-ogombo.web.app";
const LOGO={src:""},BGI={src:""};const cbs=[];
const IM={};const img=s=>{if(!IM[s]){const i=new Image();i.onload=()=>cbs.slice().forEach(c=>c.fn&&c.fn());i.src=s;IM[s]=i}return IM[s]};
const mix=(h,p)=>{const n=parseInt(h.slice(1),16),f=v=>Math.round(v+(255-v)*p);return`rgb(${f(n>>16)},${f((n>>8)&255)},${f(n&255)})`};
const rr=(X,Y,w,h,r,f,s,sh)=>{x.save();if(sh){x.shadowColor="rgba(0,0,0,.22)";x.shadowBlur=16;x.shadowOffsetY=6}x.beginPath();x.roundRect(X,Y,w,h,r);if(f){x.fillStyle=f;x.fill()}x.restore();if(s){x.beginPath();x.roundRect(X,Y,w,h,r);x.strokeStyle=s;x.lineWidth=3;x.stroke()}};
const rect=(f,X,Y,w,h)=>{x.fillStyle=f;x.fillRect(X,Y,w,h)};
const shade=(h,p)=>{const n=parseInt(h.slice(1),16),f=v=>Math.round(v*(1-p));return`rgb(${f(n>>16)},${f((n>>8)&255)},${f(n&255)})`};
const grect=(c,X,Y,w,h,v)=>{const g=x.createLinearGradient(X,Y,v?X:X+w,v?Y+h:Y);g.addColorStop(0,c);g.addColorStop(1,shade(c,.4));x.fillStyle=g;x.fillRect(X,Y,w,h)};
const hex=(h,p)=>{const n=parseInt(h.slice(1),16),f=v=>Math.round(v+(255-v)*p).toString(16).padStart(2,"0");return"#"+f(n>>16)+f((n>>8)&255)+f(n&255)};
const hexd=(h,p)=>{const n=parseInt(h.slice(1),16),f=v=>Math.round(v*(1-p)).toString(16).padStart(2,"0");return"#"+f(n>>16)+f((n>>8)&255)+f(n&255)};
const lum=h=>{const n=parseInt(String(h).slice(1),16)||0;return(.299*(n>>16)+.587*((n>>8)&255)+.114*(n&255))/255};
const ink=h=>lum(h)>.6?"#10243a":"#fff";
const gf=(c,X,w)=>{if(S.gr===false||S.sty==4)return c;const g=x.createLinearGradient(X,0,X+w,0);g.addColorStop(0,c);g.addColorStop(1,shade(c,.32));return g};
const EMO="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'";
const SF=()=>1+Math.min(.7,D/1200);
const RAD=()=>[22,8,34,14,4][S.sty];
function decor(){if(!S.dec)return;x.save();x.fillStyle=mix(S.a,.8);x.globalAlpha=.6;x.beginPath();x.arc(W-70,70,190,0,7);x.fill();x.beginPath();x.arc(40,H-80,230,0,7);x.fill();x.restore()}
function wrap(t,w){const out=[];String(t).split("\n").forEach(par=>{let l="";par.split(" ").forEach(wd=>{const tt=l?l+" "+wd:wd;if(x.measureText(tt).width>w&&l){out.push(l);l=wd}else l=tt});out.push(l)});return out}
function txt(t,X,Y,w,h,o){x.save();x.fillStyle=o.c;x.textAlign=o.al||"left";const fam=o.mono?"monospace":'"'+(o.hf||/^f-(head|title|sub)$/.test(o.f||"")?S.hf:S.bf)+'",Arial,sans-serif';let s=o.max,L;
for(;s>=o.min;s-=2){x.font=(o.it?"italic ":"")+(o.b===0?"":"bold ")+s+"px "+fam;L=wrap(t,w);if(L.length*s*1.25<=h&&!L.some(l=>x.measureText(l).width>w))break}
if(L.length*s*1.25>h+2||L.some(l=>x.measureText(l).width>w+2))(window.__issues=window.__issues||[]).push([S.type,S.design,o.f||"",String(t).slice(0,30)]);
const lh=s*1.25,ox=o.al=="center"?X+w/2:X,oy=o.mid?Y+(h-L.length*lh)/2:Y;
L.forEach((l,i)=>x.fillText(l,ox,oy+i*lh+s));x.restore();if(o.f)R.push({f:o.f,x:X,y:Y,w,h})}
function bgfx(){const m=S.bgm;if(m=="none")return;
if(m=="dots"){x.fillStyle=mix(S.a,.8);for(let i=0;i<W;i+=40)for(let j=0;j<H;j+=40){x.beginPath();x.arc(i+20,j+20,4,0,7);x.fill()}}
else if(m=="stripes"){x.strokeStyle=mix(S.a,.9);x.lineWidth=26;for(let i=-H;i<W;i+=80){x.beginPath();x.moveTo(i,0);x.lineTo(i+H,H);x.stroke()}}
else if(m=="cross"){x.fillStyle=mix(S.a,.82);x.font="bold 46px Arial";x.textAlign="center";for(let i=0;i<W;i+=120)for(let j=0;j<H;j+=120)x.fillText("+",i+60+((j/120)%2?60:0),j+60);x.textAlign="left"}
else{const i=img(m=="custom"?(BGI.src||"/assets/theatre-lights.jpg"):m);if(i.complete&&i.naturalWidth){const B=S.bgb==null?6:S.bgb,pd=B*3+4,ww=W+pd*2,hh=H+pd*2,k=Math.max(ww/i.naturalWidth,hh/i.naturalHeight),w=i.naturalWidth*k,h=i.naturalHeight*k;x.save();try{if(B>0)x.filter="blur("+B+"px)"}catch(e){}x.drawImage(i,(W-w)/2,(H-h)/2,w,h);x.restore();x.globalAlpha=S.bgd==null?.9:S.bgd;rect(S.bg,0,0,W,H);x.globalAlpha=1}}}
function header(y0,hh){const s=S.sty,col=S.hp||S.p,tc=S.ht||"#fff",ha=S.ha||S.a,inset=s==0,mx=inset?36:0,w=W-mx*2,r=S.hr==null?(inset?24:0):S.hr,f=gf(col,mx,w);
if(inset)rr(mx,y0,w,hh,r,f,null,1);else if(r>0)rr(0,y0,W,hh,r,f);else rect(f,0,y0,W,hh);
if(s!=4&&S.dec){x.save();x.beginPath();x.roundRect(mx,y0,w,hh,r);x.clip();x.fillStyle="rgba(255,255,255,.09)";x.beginPath();x.arc(W-mx-90,y0+10,hh*.9,0,7);x.fill();x.beginPath();x.arc(mx+60,y0+hh+20,hh*.6,0,7);x.fill();x.restore()}
if(s==1)rect(ha,0,y0+hh,W,8);if(s==2)rect(ha,0,y0+hh,W,5);if(s==4)rect(ha,0,y0+hh-6,W,6);
let lx=mx+34;
if(s==3){const em=S.emo=="header"&&S.icon,bw=Math.round(hh*(em?1.05:.3));rect(ha,0,y0,bw,hh);if(em){x.save();x.font=Math.round(hh*.5)+"px "+EMO;x.textAlign="center";x.fillStyle="#000";x.fillText(S.icon,bw/2,y0+hh*.66);x.restore()}lx=bw+30}
else if(S.emo=="header"&&S.icon){x.save();x.font=Math.round(hh*.46)+"px "+EMO;x.fillStyle="#000";x.fillText(S.icon,lx,y0+hh*.64);x.restore();lx+=Math.round(hh*.62)}
if(S.lg&&S.lx<300&&S.ly<y0+hh)lx=Math.max(lx,S.lx+S.ls+22);
const rm=S.sn?180:34,tw=W-mx-rm-lx,al=s==3?"left":"center";
if(S.head)txt(S.head,lx,y0+10,tw,30,{c:ha,max:24,min:12,al,f:"f-head"});
txt(S.title,lx,y0+(S.head?40:12),tw,hh-(S.head?50:24),{c:tc,max:96,min:30,al,f:"f-title",mid:1});
return y0+hh+(s==1?8:s==2?5:0)}
function panel(X,Y,w,h,col,head,fld){const s=S.sty,fill=S.pn||hex(S.a,.9),r=S.pr==null?RAD()+(s==0?10:0):S.pr,hd=head?66:0,hc=S.ph||"#fff";
if(s==1){rr(X,Y,w,h,r,fill,col,1);if(head){x.save();x.beginPath();x.roundRect(X,Y,w,h,r);x.clip();x.fillStyle=col;x.fillRect(X,Y,w,hd);x.restore();txt(head,X+14,Y+6,w-28,hd-12,{c:hc,max:36,min:14,al:"center",mid:1,hf:1,f:fld})}}
else if(s==3){rr(X,Y,w,h,r,fill,null,1);x.save();x.beginPath();x.roundRect(X,Y,w,h,r);x.clip();x.fillStyle=col;x.fillRect(X,Y,16,h);x.restore();if(head)txt(head,X+34,Y+10,w-52,hd-14,{c:col,max:38,min:14,mid:1,hf:1,f:fld})}
else if(s==4){rr(X,Y,w,h,r,fill,null,0);if(head){txt(head,X+22,Y+8,w-44,hd-18,{c:col,max:38,min:14,mid:1,hf:1,f:fld});rect(col,X+22,Y+hd-8,Math.min(120,w-44),6)}}
else{rr(X,Y,w,h,r,fill,s==2?null:col,1);if(head)txt(head,X+22,Y+10,w-44,hd-14,{c:col,max:38,min:14,al:"left",mid:1,hf:1,f:fld})}
const px=s==3?34:22;return{x:X+px,y:Y+(head?hd+4:16),w:w-px-22,h:h-(head?hd+4:16)-16}}
function tipPanel(X,Y,w,h){const col=S.tc||S.a,i=panel(X,Y,w,h,col,S.tiph||"","f-tiph"),parts=S.tip.split("|").map(t=>t.trim()).filter(Boolean),t=parts.length>1?parts.map(t=>"• "+t).join("\n"):S.tip;txt(t,i.x,i.y,i.w,i.h,{c:S.t,max:42,min:14,mid:1,b:0,f:"f-tip"})}
function footer(fy,fh){const s=S.sty,col=S.fp||S.p,tc=S.ft||"#fff",inset=s==0,mx=inset?36:0,w=W-mx*2,r=S.fr==null?(inset?20:0):S.fr,ac=S.fc||S.a,f=gf(col,mx,w);
if(s==4){rect(f,0,fy,W,fh);rect(ac,0,fy,W,6)}else if(inset)rr(mx,fy,w,fh,r,f,null,1);else{if(r>0)rr(0,fy,W,fh,r,f);else rect(f,0,fy,W,fh);if(s==1)rect(ac,0,fy,W,6);if(s==2)rect(ac,0,fy,W,4)}
let lab=((S.emo=="footer"&&S.icon?S.icon+" ":"")+(S.fl||"")).trim();let tx=mx+30,tw=w-60,al="center";
if(lab){const fs=Math.min(32,fh*.42);x.save();x.font="bold "+fs+"px "+EMO+',"'+S.bf+'",Arial';const cw=Math.min(w*.42,x.measureText(lab).width+56);x.restore();
if(s==3){rect(ac,0,fy,cw,fh);txt(lab,0,fy,cw,fh,{c:ink(ac),max:fs,min:12,al:"center",mid:1,f:"f-fl"});tx=cw+26}
else{const cx=mx+18,ch=fh*.66;rr(cx,fy+fh*.17,cw,ch,ch/2,ac);txt(lab,cx,fy+fh*.17,cw,ch,{c:ink(ac),max:fs,min:12,al:"center",mid:1,f:"f-fl"});tx=cx+cw+22}
tw=mx+w-tx-30;al="left"}
txt(S.footer,tx,fy+6,tw,fh-12,{c:tc,max:30,min:12,al,mid:1,f:"f-footer"})}
const lines=()=>S.body.split("\n").map(l=>l.trim()).filter(Boolean);
function fit(t,w,h,o){const fam='"'+S.bf+'",Arial,sans-serif';let z=o.max;for(;z>=o.min;z-=2){x.font=(o.b===0?"":"bold ")+z+"px "+fam;const L=wrap(t,w);if(L.length*z*1.25<=h&&!L.some(l=>x.measureText(l).width>w))break}return z}
function body(bx,by,bw,bh){const P=S.p,A=S.a,T=S.t,k=S.kind,PC1=S.pc||P,PNL=S.pn||hex(A,.9);R.push({f:"f-body",x:bx,y:by,w:bw,h:bh});
if(k=="B"){rr(bx,by,bw,bh,RAD()+6,PNL,S.sty==0?PC1:null,1);const circ=(S.emo||"circle")=="circle"&&S.icon;if(circ){x.beginPath();x.arc(bx+bw/2,by+90,72,0,7);x.fillStyle=PC1;x.fill();x.lineWidth=6;x.strokeStyle="#fff";x.stroke();x.font="80px "+EMO;x.textAlign="center";x.fillStyle=T;x.fillText(S.icon,bx+bw/2,by+118)}x.textAlign="center";if(S.type=="quote"){x.font="bold 190px Georgia";x.fillStyle=mix(A,.55);x.fillText("“",bx+80,by+170)}x.textAlign="left";
txt(S.body,bx+30,by+(circ?180:36),bw-60,bh-(circ?205:72),{c:T,max:66*SF(),min:26,al:"center",mid:1,mono:S.type=="spell"})}
else if(k=="N"){const i=panel(bx,by,bw,bh,PC1,S.bhd||"",S.bhd?"f-bhd":null);txt(S.body,i.x,i.y,i.w,i.h,{c:T,max:46*SF(),min:20,b:0,mid:1})}
else if(k=="D"){const par=S.body.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean),def=par[0]||"",ex=par.slice(1).join(" "),g=18,eh=ex?Math.round(bh*.34):0,dh=bh-eh-(ex?g:0),i1=panel(bx,by,bw,dh,PC1,"MEANING");txt(def,i1.x,i1.y,i1.w,i1.h,{c:T,max:50*SF(),min:20,b:0,mid:1});
if(ex){const i2=panel(bx,by+dh+g,bw,eh,S.tc||A,"EXAMPLE");txt("“"+ex.replace(/^[“"]|[”"]$/g,"")+"”",i2.x,i2.y,i2.w,i2.h,{c:T,max:38*SF(),min:16,b:0,it:1,mid:1})}
if((S.emo||"circle")=="circle"&&S.icon){x.save();x.beginPath();x.arc(bx+bw-52,by+10,46,0,7);x.fillStyle=PC1;x.fill();x.lineWidth=5;x.strokeStyle="#fff";x.stroke();x.font="48px "+EMO;x.textAlign="center";x.fillStyle=T;x.fillText(S.icon,bx+bw-52,by+27);x.restore()}}
else if(k=="L"){const L=lines().slice(0,S.n),n=L.length,g=14,rh=Math.min(110*(1+D/600),(bh-g*(n-1))/n),chk=S.type=="chk";
L.forEach((l,i)=>{const y=by+i*(rh+g);rr(bx,y,bw,rh,RAD(),PNL,null,1);const r=Math.min(30,rh*.34);
if(chk){rr(bx+22,y+rh/2-r,r*2,r*2,8,PC1);txt("✓",bx+22,y+rh/2-r,r*2,r*2,{c:"#fff",max:34,min:14,al:"center",mid:1})}else{x.beginPath();x.arc(bx+22+r,y+rh/2,r,0,7);x.fillStyle=PC1;x.fill();txt(String(i+1),bx+22,y+rh/2-r,r*2,r*2,{c:"#fff",max:34,min:14,al:"center",mid:1})}
txt(l,bx+22+r*2+20,y+6,bw-r*2-70,rh-12,{c:T,max:36*SF(),min:16,mid:1,b:0})})}
else if(k=="Q"){const L=lines(),q=L[0]||"",o=L.slice(1,1+S.n),g=12,qh=130+D/6,oh=Math.min(80*(1+D/600),(bh-qh-20-g*(o.length-1))/Math.max(o.length,1));
txt(q,bx,by,bw,qh,{c:T,max:46*SF(),min:22,mid:1});
o.forEach((t,i)=>{const y=by+qh+12+i*(oh+g);rr(bx,y,bw,oh,RAD(),PNL,null,1);rr(bx+10,y+oh*.12,oh*.76,oh*.76,10,PC1);txt(String.fromCharCode(65+i),bx+10,y+oh*.12,oh*.76,oh*.76,{c:"#fff",max:34,min:14,al:"center",mid:1});txt(t,bx+oh+16,y+4,bw-oh-30,oh-8,{c:T,max:34*SF(),min:16,mid:1,b:0})})}
else if(k=="T"){const L=lines().slice(0,S.n+1).map(l=>l.split("|").map(c=>c.trim())),cols=Math.max(1,...L.map(r=>r.length)),n=L.length,g=5,rh=Math.min(86*(1+D/600),(bh-g*(n-1))/n),cw=bw/cols;
L.forEach((r,i)=>{const y=by+i*(rh+g);for(let j=0;j<cols;j++){const X=bx+j*cw,hd=i==0;rect(hd?PC1:i%2?mix(A,.82):mix(A,.92),X,y,cw-g,rh);txt(r[j]||"",X+14,y+4,cw-g-28,rh-8,{c:hd?"#fff":T,max:(hd?36:32)*SF(),min:14,mid:1,al:j==0?"left":"center",b:hd||j==0?1:0})}})}
else if(k=="P"){let sec=S.body.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean).slice(0,S.n);if(!sec.length)sec=["HEADING"];
const n=sec.length,cols=SIDE&&bw<900?(n<=3?1:2):(n<=3?n:n==4?2:3),rows=Math.ceil(n/cols),g=18,pw=(bw-g*(cols-1))/cols,ph=(bh-g*(rows-1))/rows;
const bl=sec.map(s=>s.split("\n").slice(1).map(l=>"• "+l.replace(/^[•\-]\s*/,"")).join("\n")),sx=S.sty==3?34:22,hd=66+4,sz=Math.min(...bl.map(t=>fit(t,pw-sx-22,ph-hd-16,{max:44*SF(),min:13,b:0})));
sec.forEach((s,i)=>{const ls=s.split("\n"),px=bx+(i%cols)*(pw+g),py=by+Math.floor(i/cols)*(ph+g),col=S.mc?PC[i%6]:i%2?S.a:PC1,inn=panel(px,py,pw,ph,col,ls[0]);
txt(bl[i],inn.x,inn.y,inn.w,inn.h,{c:T,max:sz,min:13,b:0})})}}
function narr(nx,ny,nw,nh,im,cap){NB={x:nx,y:ny,w:nw,h:nh};if(S.dec){const r=Math.min(nw*.62,cap||999);x.beginPath();x.arc(nx+nw/2,ny+nh*.55,r,0,7);x.fillStyle=mix(S.a,.7);x.fill()}x.save();if(S.flip){x.translate(nx+nw,0);x.scale(-1,1);x.drawImage(im,0,ny,nw,nh)}else x.drawImage(im,nx,ny,nw,nh);x.restore()}
function sticker(sx,sy){SK=null;if(S.sk!="none"){const z=S.sks;x.save();x.font=z+"px "+EMO;x.fillStyle="#000";x.fillText(S.sk,sx,sy+z*.85);x.restore();SK={x:sx,y:sy,w:z*1.15,h:z}}}
function qrBox(X,Y){QB=null;if(S.qr){const u=qurl(),c=document.createElement("canvas");try{EO_QR.drawQR(c,u,S.qs,{noLogo:true});QB={x:X,y:Y,w:S.qs+20,h:S.qs+46};rr(QB.x,QB.y,QB.w,QB.h,14,"#fff",S.p,1);x.drawImage(c,QB.x+10,QB.y+10,S.qs,S.qs);txt("SCAN ME",QB.x,QB.y+S.qs+12,QB.w,30,{c:S.p,max:22,min:12,al:"center"})}catch(e){}}}
function extras(){LB=null;if(S.lg){const im=img(S.lgs=="avatar"?"/assets/avatar-illustration.jpg":(S.lgu||LOGO.src));if(S.lgu||LOGO.src||S.lgs=="avatar")if(im.complete&&im.naturalWidth){const z=S.ls,av=S.lgs=="avatar",w=av?z:z*im.naturalWidth/im.naturalHeight;x.save();x.globalAlpha=S.lo;if(av){x.beginPath();x.arc(S.lx+z/2,S.ly+z/2,z/2,0,7);x.clip()}x.drawImage(im,S.lx,S.ly,w,z);x.restore();if(av){x.beginPath();x.arc(S.lx+z/2,S.ly+z/2,z/2,0,7);x.lineWidth=4;x.strokeStyle="#fff";x.stroke()}LB={x:S.lx,y:S.ly,w,h:z}}}
if(S.sn){rr(W-160,20,130,52,26,"#fff");txt(S.sn,W-160,20,130,52,{c:S.p,max:30,min:14,al:"center",mid:1})}}
function qurl(){const v=S.qrt=="custom"?S.qrc.trim():S.qrt;return/^https?:/.test(v)?v:BASE+(v.startsWith("/")?v:"/"+v)}
function thumb(){const P=S.p,A=S.a,w=1200,h=630;
grect(P,0,0,w,h,0);x.save();x.globalAlpha=.1;x.fillStyle="#fff";x.beginPath();x.arc(1080,90,260,0,7);x.fill();x.beginPath();x.arc(120,600,200,0,7);x.fill();x.restore();
const im=S.nar!="none"?img(NB_BASE+S.nar+".png"):null;let tw=1080;NB=null;
if(im&&im.complete&&im.naturalWidth){const nh=Math.min(580,S.ns*1.8),nw=nh*im.naturalWidth/im.naturalHeight,nx=w-nw-50,ny=h-nh+8;tw=nx-100;NB={x:nx,y:ny,w:nw,h:nh};
x.beginPath();x.arc(nx+nw/2,ny+nh*.5,nw*.64,0,7);x.fillStyle="rgba(255,255,255,.14)";x.fill();x.save();if(S.flip){x.translate(nx+nw,0);x.scale(-1,1);x.drawImage(im,0,ny,nw,nh)}else x.drawImage(im,nx,ny,nw,nh);x.restore()}
SK=null;if(S.sk!="none"){const z=Math.min(190,S.sks*1.3),sx=NB?NB.x-z*.55:w-z-60,sy=70;x.save();x.font=z+"px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'";x.fillStyle="#000";x.fillText(S.sk,sx,sy+z*.85);x.restore();SK={x:sx,y:sy,w:z*1.15,h:z}}
rect(A,0,h-14,w,14);
txt(S.head,60,48,tw,34,{c:mix(A,.35),max:26,min:14,f:"f-head"});
txt(S.title,60,96,tw,330,{c:"#fff",max:88,min:30,f:"f-title",mid:1});
txt(S.sub,60,h-190,tw,76,{c:mix(A,.55),max:36,min:18,f:"f-sub",b:0});
txt(S.footer,60,h-92,tw,50,{c:"rgba(255,255,255,.8)",max:24,min:12,f:"f-footer",b:0})}
function draw(cv,spec,opts){opts=opts||{};S=spec;if(opts.base)BASE=opts.base;const main=cv.getContext("2d");
if(opts.onImage){const o=cbs.find(c=>c.cv==cv);if(o)o.fn=opts.onImage;else cbs.push({cv,fn:opts.onImage})}
R=[];NB=QB=LB=SK=null;
if(S.fmt=="thumb"){SC=window.EO_CARD&&EO_CARD.scale||1;if(cv.width!=1200*SC||cv.height!=630*SC){cv.width=1200*SC;cv.height=630*SC}x=main;x.setTransform(SC,0,0,SC,0,0);W=1200;H=630;D=0;SIDE=false;thumb();extras();x.setTransform(1,0,0,1,0,0);VT={k:SC,ox:0};return info()}
const f=FM[S.fmt]||FM.sq,k=f[0]>f[1]?f[1]/1080:1;
SC=window.EO_CARD&&EO_CARD.scale||1;if(cv.width!=f[0]*SC||cv.height!=f[1]*SC){cv.width=f[0]*SC;cv.height=f[1]*SC}
x=main;x.setTransform(k*SC,0,0,k*SC,0,0);W=Math.round(f[0]/k);H=Math.round(f[1]/k);D=Math.max(0,H-1080);
x.clearRect(0,0,W,H);rect(S.bg,0,0,W,H);bgfx();decor();
const s=S.sty,inset=s==0,hh=S.hh||150,fh=S.fh||88,y0=inset?30:0,fy=inset?H-fh-30:H-fh,pad=44;
let ct=header(y0,hh)+(S.sub?0:22);
if(S.sub){x.save();x.font='bold 34px "'+S.hf+'",Arial';const cw=Math.min(W-120,x.measureText(S.sub).width+90),cx0=(W-cw)/2;x.restore();rr(cx0,ct+12,cw,52,26,S.pn||hex(S.a,.9),S.pc||S.p,1);txt(S.sub,cx0+16,ct+14,cw-32,48,{c:S.t,max:34,min:16,al:"center",mid:1,f:"f-sub",b:1});ct+=12+52+16}
if(S.ban){rr(pad,ct,W-pad*2,54,RAD(),S.a,null,1);txt(S.ban,pad+10,ct+4,W-pad*2-20,46,{c:ink(S.a),max:30,min:14,al:"center",mid:1,f:"f-ban"});ct+=54+16}
if(s==2){x.save();x.strokeStyle=S.a;x.lineWidth=5;x.beginPath();x.roundRect(20,ct-6,W-40,fy-ct-10,26);x.stroke();x.restore()}
const cb=fy-22,lay=S.lay||"L",side=lay!="stack",left=lay!="R",hasN=S.nar!="none",im=hasN?img(NB_BASE+S.nar+".png"):null,imOk=im&&im.complete&&im.naturalWidth;SIDE=side;
if(side){const nc=hasN?Math.round(Math.min(W*.4,540)):0,gap=nc?12:0,cx=left?pad+nc+gap:pad,cw=W-pad*2-nc-gap;
 if(imOk){let nh=Math.min(fy-ct+24,S.ns*2.1),nw=nh*im.naturalWidth/im.naturalHeight;if(nw>nc*1.12){nw=nc*1.12;nh=nw*im.naturalHeight/im.naturalWidth}const colX=left?pad:W-pad-nc;narr(S.snx!=null?S.snx:colX+(nc-nw)/2,S.sny!=null?S.sny:fy-nh+24,nw,nh,im,nc/2-4)}
 const qrw=S.qr?S.qs+20:0,tipH=S.tip?Math.round(Math.min(280,Math.max(150,(cb-ct)*.34))):0;
 body(cx,ct,cw,cb-ct-(tipH?tipH+16:0));if(tipH)tipPanel(cx,cb-tipH,cw-(qrw?qrw+16:0),tipH);
 qrBox(S.sqx!=null?S.sqx:cx+cw-qrw,S.sqy!=null?S.sqy:cb-(S.qs+46));
 const z=S.sks;sticker(S.ssx!=null?S.ssx:(left?pad+nc-z*1.2:W-pad-nc+z*.2),S.ssy!=null?S.ssy:ct+10)}
else{const zh=(S.tip||hasN||S.qr)?230:0;let bx0=50;
 body(pad,ct,W-pad*2,cb-ct-(zh?zh+10:0));
 if(imOk){const h=S.ns,w=h*im.naturalWidth/im.naturalHeight;bx0=Math.max(50,Math.min(S.nx+w+20,600));narr(S.nx,S.ny+D,w,h,im)}
 if(S.sk!="none")bx0=Math.min(700,Math.max(bx0,S.skx+S.sks*1.15+10));
 const qw=S.qr?S.qs+40:0,bw=W-50-bx0-(S.qr?qw+10:0);
 if(S.tip)tipPanel(bx0,cb-zh+10,bw,zh-20);
 sticker(S.skx,S.sky+D);qrBox(S.qx,S.qy+D)}
footer(fy,fh);extras();
x.setTransform(1,0,0,1,0,0);VT={k:k*SC,ox:0};
return info()}
const info=()=>({R,NB,QB,LB,SK,VT});
// ---- spec helpers
const recolor=sp=>{const s=sp.sty,lt=s==4;sp.hp=lt?hex(sp.a,.86):sp.p;sp.ht=lt?sp.p:"#ffffff";sp.ha=lt?hexd(sp.a,.15):sp.a;sp.fp=sp.hp;sp.ft=sp.ht;sp.fc=lt?sp.p:sp.a;sp.pn=lt?"#ffffff":hex(sp.a,.9);sp.pc=sp.p;sp.ph="#ffffff";sp.tc=sp.a;return sp};
const radii=sp=>{sp.hr=sp.sty==0?24:0;sp.fr=sp.sty==0?20:0;sp.pr=[22,8,34,14,4][sp.sty]+(sp.sty==0?10:0);return sp};
const design=(sp,i)=>{sp.design=+i;sp.sty=Math.floor(i/10)%5;[sp.p,sp.a,sp.bg,sp.t]=PAL[i%10];radii(sp);return recolor(sp)};
const defaults=()=>design({emo:"circle",type:"word",design:0,sty:0,kind:"B",icon:"📖",head:"",title:"",sub:"",body:"",tip:"",footer:"FB @ezraogombo  •  IG @ezraogombo  •  ezra-ogombo.web.app",n:3,p:"#0d2a6b",a:"#1b9bb0",bg:"#eef5fc",t:"#0d2a6b",mc:true,bgm:"none",nar:"neutral",flip:false,ns:290,nx:20,ny:765,qr:false,qrt:"/",qrc:"",ban:"",dec:true,fmt:"sq",hf:"Arial",bf:"Arial",lg:false,lgs:"avatar",lx:20,ly:12,ls:72,lo:1,sk:"none",sks:100,skx:262,sky:780,sn:"",qs:150,qx:870,qy:760,lay:"L",hh:150,fh:88,gr:true,fl:"",tiph:"QUICK TIP",bgb:6,bgd:.8,snx:null,sny:null,sqx:null,sqy:null,ssx:null,ssy:null},0);
let META=[{n:"neutral",k:"",s:"",a:1},{n:"point-hip",k:"",s:"💡",a:1},{n:"gloves",k:"",s:"🧼",a:1},{n:"worried",k:"",s:"",a:1},{n:"palms-up",k:"",s:"",a:1}];
const POSES=()=>META.map(m=>m.n);
let LP=null;
const loadPoses=()=>LP||(LP=fetch("/assets/narrators/index.json").then(r=>r.json()).then(j=>{if(j&&j.poses&&j.poses.length)META=j.poses.map(p=>typeof p=="string"?{n:p,k:"",s:"",a:1}:p);return POSES()}).catch(()=>POSES()));
const needs=sp=>{const a=[];if(sp.nar&&sp.nar!="none")a.push(NB_BASE+sp.nar+".png");if(sp.lg)a.push(sp.lgs=="avatar"?"/assets/avatar-illustration.jpg":(sp.lgu||LOGO.src));if(/^\//.test(sp.bgm||""))a.push(sp.bgm);if(sp.bgm=="custom"&&BGI.src)a.push(BGI.src);return a.filter(Boolean)};
const ready=sp=>Promise.all(needs(sp).map(s=>new Promise(r=>{const i=img(s);if(i.complete)return r();i.addEventListener("load",r);i.addEventListener("error",r)})));
window.EO_CARD={scale:1,draw,design,recolor,radii,bg:BGI,defaults,ready,loadPoses,PAL,PN,STY,FM,get poses(){return POSES()},get meta(){return META},logo:LOGO,NB_BASE,setBase:b=>{BASE=b}};
})();
