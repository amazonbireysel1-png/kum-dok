/* Kum Dök — fizik motoru v2 (80x120 hücre, dünya 400x600 birim)
   v2: ince çizgi (fizik/görsel ayrı), ince+geniş bardak ağzı (flare), hareketli engeller,
   kum türleri (ağır/hafif/çamur), fizik bölgeleri (çamur-yavaş, rüzgar, yukarı akım). */
(function(root){
'use strict';
var W=400,H=600,CELL=5,GW=80,GH=120;
var E=0,S=1,WALL=2,LAVA=3,DRAW=4,MW=5;
var RED=16,BLUE=17,STEEL=18,FOAM=19,MUD=20;
var SOLID=new Uint8Array([0,0,1,0,1,1]);   // WALL, DRAW, MW katı
/* Ayarlanabilir değerler. drawR: çizginin FİZİKSEL yarıçapı (hücre). Görsel kalınlık game.js'de ayrı (INK_VIS). */
var CFG={
  drawR:0.8,        // eski: 1.25  -> ince çizgi (yuvarlak uçlu)
  cupWall:5,        // eski: 10 birim -> bardak cam kalınlığı (1 hücre)
  flare:3,          // bardak ağzı yanlara açılma (hücre) — geniş ağız
  slideRange:14,    // kum katı yüzeyde yan yöne kayacağı boşluğu en çok kaç hücre uzağa arar
  guardX:2,         // huni çıkışının her iki yanında çizilemeyen hücre (çıkış tıkanmasın)
  guardUp:1,        // huni çıkış satırının üstü
  guardDown:2,      // huni çıkış satırının altı
  hookLen:8,        // parmak kalkarken oluşan kuyruk kıvrımı bu uzunluğa kadar kırpılır (birim)
  displaceRange:4   // çizgi kumun üstüne gelirse kum en yakın boşluğa itilir (silinmez)
};

function rng(seed){
  return function(){
    seed|=0; seed=seed+0x6D2B79F5|0;
    var t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function Sim(level){
  this.L=level;
  this.t=new Uint8Array(GW*GH);
  this.c=new Uint8Array(GW*GH);
  this.vx=new Int8Array(GW*GH);
  this.zn=null;
  this.strokes=[];
  this.ink=level.ink||0;
  this.inkUsed=0;
  this.g=1;
  this.flipsLeft=level.flips||0;
  this.flips=0;
  this.frame=0;
  this.state='ready';
  this.noMove=0;
  this.sealed=false;
  this.winHold=0;
  this.burned=0;
  this.lost=0;
  this.fx=[];
  this.rand=rng(level.seed||12345);
  this.total=0;
  this.emitted=0;
  this.em=[];
  this.cups=[];
  this.movers=[];
  this.mvCells=[];
  this.hasKinds=false;
  this.result=null;
  this.bestMatch=0; this.lastProgress=0; this.lastEmitted=0; this.lastEmitFrame=0;
  this.build();
}

Sim.prototype.stampRect=function(x,y,w,h,type){
  var cx0=Math.max(0,Math.floor(x/CELL)), cx1=Math.min(GW,Math.ceil((x+w)/CELL));
  var cy0=Math.max(0,Math.floor(y/CELL)), cy1=Math.min(GH,Math.ceil((y+h)/CELL));
  for(var cy=cy0;cy<cy1;cy++)for(var cx=cx0;cx<cx1;cx++){
    var i=cy*GW+cx; this.t[i]=type; this.c[i]=0;
  }
};
Sim.prototype.clearRect=function(x,y,w,h){ this.stampRect(x,y,w,h,E); };

/* kum bir katı hücreye çizilirse silinmez: en yakın boşluğa itilir */
Sim.prototype.displace=function(i){
  var t=this.t, x=i%GW, y=(i/GW)|0, g=this.g, R=CFG.displaceRange;
  for(var r=1;r<=R;r++){
    for(var s=0;s<=r;s++){
      for(var sg=-1;sg<=1;sg+=2){
        var dx=s*sg; if(s===0&&sg===1)continue;
        var cx=x+dx, cy=y-g*r;
        if(cx<1||cx>=GW-1||cy<1||cy>=GH-1)continue;
        var j=cy*GW+cx;
        if(t[j]===E){ t[j]=S; this.c[j]=this.c[i]; this.vx[j]=0; return true; }
      }
    }
    for(var d=-1;d<=1;d+=2){
      var cx2=x+d*r; if(cx2<1||cx2>=GW-1)continue;
      var j2=y*GW+cx2; if(t[j2]===E){ t[j2]=S; this.c[j2]=this.c[i]; this.vx[j2]=0; return true; }
    }
  }
  this.lost++; return false;
};

Sim.prototype.stampLine=function(x1,y1,x2,y2,r,type,staticMode){
  var d=Math.hypot(x2-x1,y2-y1), n=Math.max(1,Math.ceil(d/2));
  var t=this.t, list=(type===MW)?this.mvCells:null;
  for(var k=0;k<=n;k++){
    var px=(x1+(x2-x1)*k/n)/CELL, py=(y1+(y2-y1)*k/n)/CELL;
    var ix0=Math.floor(px-r), ix1=Math.ceil(px+r), iy0=Math.floor(py-r), iy1=Math.ceil(py+r);
    for(var cy=iy0;cy<=iy1;cy++)for(var cx=ix0;cx<=ix1;cx++){
      if(cx<1||cx>=GW-1||cy<1||cy>=GH-1)continue;
      var dx=cx+0.5-px, dy=cy+0.5-py;
      if(dx*dx+dy*dy>r*r)continue;
      var i=cy*GW+cx;
      if(type===DRAW&&this.gmask&&this.gmask[i])continue;
      if(staticMode){ t[i]=type; this.c[i]=0; }
      else if(t[i]===S){ this.displace(i); t[i]=type; this.c[i]=0; if(list)list.push(i); }
      else if(t[i]===E){ t[i]=type; this.c[i]=0; if(list)list.push(i); }
    }
  }
};

Sim.prototype.build=function(){
  var L=this.L, i, self=this;
  for(i=0;i<GW;i++){ this.t[i]=WALL; this.t[(GH-1)*GW+i]=WALL; }
  for(i=0;i<GH;i++){ this.t[i*GW]=WALL; this.t[i*GW+GW-1]=WALL; }
  (L.walls||[]).forEach(function(w){ self.stampRect(w.x,w.y,w.w,w.h,WALL); });
  (L.planks||[]).forEach(function(p){ self.stampLine(p.x1,p.y1,p.x2,p.y2,Math.max(0.9,(p.w||10)/2/CELL),WALL,true); });
  (L.lava||[]).forEach(function(v){ self.stampRect(v.x,v.y,v.w,v.h,LAVA); });
  if(L.zones&&L.zones.length){
    this.zn=new Uint8Array(GW*GH);
    var code={goo:1,windR:2,windL:3,boost:4};
    L.zones.forEach(function(z){
      var c0=Math.max(0,Math.floor(z.x/CELL)), c1=Math.min(GW,Math.ceil((z.x+z.w)/CELL));
      var r0=Math.max(0,Math.floor(z.y/CELL)), r1=Math.min(GH,Math.ceil((z.y+z.h)/CELL));
      for(var r=r0;r<r1;r++)for(var c=c0;c<c1;c++)self.zn[r*GW+c]=code[z.k]||0;
    });
  }
  (L.cups||[]).forEach(function(cu){ self.cups.push(self.buildCup(cu)); });
  (L.emitters||[]).forEach(function(e){
    self.em.push({x:e.x,y:e.y,n:e.n,left:e.n,rate:e.rate||1.4,color:e.color||0,acc:0,delay:e.delay||0,spread:Math.max(3,Math.min(11,e.spread|0||3))});
    self.total+=e.n; if(e.color>=STEEL)self.hasKinds=true;
  });
  if(this.em.length){ this.gmask=new Uint8Array(GW*GH); this.em.forEach(function(e){ var ecx=Math.round(e.x/CELL), ecy=Math.round(e.y/CELL), gx=Math.max(CFG.guardX,(e.spread>>1)+1); for(var yy=ecy-CFG.guardUp;yy<=ecy+CFG.guardDown;yy++)for(var xx=ecx-gx;xx<=ecx+gx;xx++){ if(xx>0&&yy>0&&xx<GW-1&&yy<GH-1)self.gmask[yy*GW+xx]=1; } }); }
  this.movers=(L.movers||[]).slice();
  if(this.movers.length)this.updateMovers();
};

/* ---- hareketli engeller ---- */
Sim.prototype.moverSeg=function(m,tm){
  var ph=m.phase||0, P=m.period||240, a=2*Math.PI*(tm/P)+ph;
  if(m.k==='swing'){
    var th=(m.ang||0)+(m.amp||0.8)*Math.sin(a);
    return [m.cx,m.cy,m.cx+Math.cos(th)*m.len,m.cy+Math.sin(th)*m.len];
  }
  if(m.k==='rot'){
    var th2=a, hx=Math.cos(th2)*m.len/2, hy=Math.sin(th2)*m.len/2;
    return [m.cx-hx,m.cy-hy,m.cx+hx,m.cy+hy];
  }
  if(m.k==='slide'){
    var u=(1+Math.sin(a))/2, cx=m.ax+(m.bx-m.ax)*u, cy=m.ay+(m.by-m.ay)*u, th3=m.ang||0;
    var hx2=Math.cos(th3)*m.len/2, hy2=Math.sin(th3)*m.len/2;
    return [cx-hx2,cy-hy2,cx+hx2,cy+hy2];
  }
  if(m.k==='gate'){
    var frac=((tm/P+ph/(2*Math.PI))%1+1)%1;
    if(frac>=(m.duty||0.5))return null;           // açık
    return [m.x,m.y,m.x+m.len*Math.cos(m.ang||0),m.y+m.len*Math.sin(m.ang||0)];
  }
  return null;
};
Sim.prototype.updateMovers=function(){
  var t=this.t, i;
  for(i=0;i<this.mvCells.length;i++){ var q=this.mvCells[i]; if(t[q]===MW)t[q]=E; }
  this.mvCells.length=0;
  for(var k=0;k<this.movers.length;k++){
    var m=this.movers[k], sg=this.moverSeg(m,this.frame); if(!sg)continue;
    this.stampLine(sg[0],sg[1],sg[2],sg[3],Math.max(0.9,(m.w||10)/2/CELL),MW,false);
  }
};

Sim.prototype.buildCup=function(cu){
  var th=CFG.cupWall, x=cu.x,y=cu.y,w=cu.w,h=cu.h, dir=cu.dir||'up';
  var fill=cu.fill||0.5, yTop,yBot,lineY,rowA,rowB;
  var flare=(cu.flare!==undefined)?cu.flare:CFG.flare;
  var t=this.t, self=this;
  function cell(cx,cy){ if(cx>=1&&cx<GW-1&&cy>=1&&cy<GH-1){ var i=cy*GW+cx; if(t[i]===E||t[i]===S){t[i]=WALL;self.c[i]=0;} } }
  if(dir==='up'){
    var floorY=y+h-th;
    this.stampRect(x,y,th,h,WALL);
    this.stampRect(x+w-th,y,th,h,WALL);
    this.stampRect(x,floorY,w,th,WALL);
    if(cu.roof){
      this.stampRect(x,y,w,th,WALL);
      var lip=cu.lip||40;
      if(cu.open==='R') this.clearRect(x+w-th,y+th,th,floorY-lip-(y+th));
      if(cu.open==='L') this.clearRect(x,y+th,th,floorY-lip-(y+th));
    } else if(flare>0){
      var cl=Math.floor(x/CELL), cr=Math.floor((x+w-th)/CELL), cyT=Math.floor(y/CELL);
      for(var k=1;k<=flare;k++){ cell(cl-k,cyT-k); cell(cl-k+1,cyT-k); cell(cr+k,cyT-k); cell(cr+k-1,cyT-k); }
    }
    yTop=cu.roof?y+th:y; yBot=floorY;
    lineY=yBot-(yBot-yTop)*fill; rowA=lineY; rowB=yBot;
  } else {
    this.stampRect(x,y,th,h,WALL);
    this.stampRect(x+w-th,y,th,h,WALL);
    this.stampRect(x,y,w,th,WALL);
    if(flare>0){
      var cl2=Math.floor(x/CELL), cr2=Math.floor((x+w-th)/CELL), cyB=Math.ceil((y+h)/CELL)-1;
      for(var k2=1;k2<=flare;k2++){ cell(cl2-k2,cyB+k2); cell(cl2-k2+1,cyB+k2); cell(cr2+k2,cyB+k2); cell(cr2+k2-1,cyB+k2); }
    }
    yTop=y+th; yBot=y+h;
    lineY=yTop+(yBot-yTop)*fill; rowA=yTop; rowB=lineY;
  }
  var c0=Math.ceil((x+th)/CELL), c1=Math.floor((x+w-th)/CELL);
  var r0=Math.floor(rowA/CELL+0.001), r1=Math.ceil(rowB/CELL-0.001);
  return {def:cu,dir:dir,x:x,y:y,w:w,h:h,c0:c0,c1:c1,r0:r0,r1:r1,lineY:lineY,
    area:(c1-c0)*(r1-r0), color:cu.color||null, count:cu.count!==false,
    thr:cu.thr||0.85, match:0, wrong:0, ok:false, pct:0, mouth:(c1-c0)*CELL};
};

Sim.prototype.evalCups=function(){
  var all=true, any=false;
  for(var k=0;k<this.cups.length;k++){
    var cp=this.cups[k]; if(!cp.count)continue; any=true;
    var m=0,wr=0;
    for(var r=cp.r0;r<cp.r1;r++)for(var cx=cp.c0;cx<cp.c1;cx++){
      var i=r*GW+cx;
      if(this.t[i]===S){
        if(!cp.color||this.c[i]===cp.color)m++; else wr++;
      }
    }
    cp.match=m; cp.wrong=wr;
    cp.pct=Math.min(1,m/(cp.area*cp.thr));
    cp.ok=(m>=cp.area*cp.thr)&&(wr<=cp.area*0.12);
    if(!cp.ok)all=false;
  }
  return any&&all;
};

Sim.prototype.beginStroke=function(x,y){
  var s={pts:[[x,y]],len:0};
  this.strokes.push(s); return s;
};
Sim.prototype.extendStroke=function(x,y){
  var s=this.strokes[this.strokes.length-1]; if(!s)return false;
  var p=s.pts[s.pts.length-1];
  var d=Math.hypot(x-p[0],y-p[1]);
  if(d<1.5)return true;
  var avail=this.ink-this.inkUsed;
  if(avail<=0.5)return false;
  if(d>avail){ var k=avail/d; x=p[0]+(x-p[0])*k; y=p[1]+(y-p[1])*k; d=avail; }
  this.inkUsed+=d; s.len+=d;
  this.stampLine(p[0],p[1],x,y,CFG.drawR,DRAW,false);
  s.pts.push([x,y]);
  return true;
};
Sim.prototype.rebuildDraw=function(){
  for(var i=0;i<this.t.length;i++) if(this.t[i]===DRAW)this.t[i]=E;
  var self=this;
  this.strokes.forEach(function(st){
    if(st.pts.length===1)self.stampLine(st.pts[0][0],st.pts[0][1],st.pts[0][0],st.pts[0][1],CFG.drawR,DRAW,false);
    for(var k=1;k<st.pts.length;k++)
      self.stampLine(st.pts[k-1][0],st.pts[k-1][1],st.pts[k][0],st.pts[k][1],CFG.drawR,DRAW,false);
  });
};
Sim.prototype.undo=function(){
  var s=this.strokes.pop(); if(!s)return false;
  this.inkUsed=Math.max(0,this.inkUsed-s.len);
  this.rebuildDraw();
  return true;
};
/* Parmak kalkarken oluşan küçük geri dönüş kıvrımını (kuyruk) kırpar; harcanan çizgi hakkını iade eder. */
Sim.prototype.trimHook=function(){
  var s=this.strokes[this.strokes.length-1]; if(!s||s.pts.length<4)return false;
  var pts=s.pts, n=pts.length, acc=0, cut=-1;
  for(var k=n-1;k>=2;k--){
    var a=pts[k-1], b=pts[k];
    acc+=Math.hypot(b[0]-a[0],b[1]-a[1]); if(acc>CFG.hookLen)break;
    var c=pts[Math.max(0,k-3)];
    // uç segmenti ile önceki gidiş yönü arasındaki açı: 100° üstü = geri dönüş
    var dx1=pts[k-1][0]-c[0], dy1=pts[k-1][1]-c[1], dx2=b[0]-pts[k-1][0], dy2=b[1]-pts[k-1][1];
    var l1=Math.hypot(dx1,dy1), l2=Math.hypot(dx2,dy2); if(l1<1||l2<0.5)continue;
    if((dx1*dx2+dy1*dy2)/(l1*l2)<-0.17){ cut=k-1; }
  }
  if(cut<1||cut>=n-1)return false;
  var removed=0; for(var q=cut+1;q<n;q++)removed+=Math.hypot(pts[q][0]-pts[q-1][0],pts[q][1]-pts[q-1][1]);
  pts.length=cut+1; s.len=Math.max(0,s.len-removed); this.inkUsed=Math.max(0,this.inkUsed-removed);
  this.rebuildDraw(); return true;
};

Sim.prototype.start=function(){ if(this.state==='ready')this.state='run'; };
Sim.prototype.flip=function(){
  if(this.state!=='run'||this.flipsLeft<=0)return false;
  this.g=-this.g; this.flipsLeft--; this.flips++;
  this.vx.fill(0); this.noMove=0;
  return true;
};

Sim.prototype.emit=function(){
  if(this.g!==1||this.sealed)return;
  for(var k=0;k<this.em.length;k++){
    var e=this.em[k]; if(e.left<=0||this.frame<e.delay)continue;
    e.acc+=e.rate;
    while(e.acc>=1&&e.left>0){
      e.acc-=1;
      var sp=e.spread, cx=Math.round(e.x/CELL)+Math.floor(this.rand()*sp)-((sp-1)>>1), cy=Math.round(e.y/CELL);
      var i=cy*GW+cx;
      if(this.t[i]===E){
        this.t[i]=S; this.c[i]=e.color?e.color:Math.floor(this.rand()*8); this.vx[i]=0;
        e.left--; this.emitted++;
      } else { e.acc=Math.min(e.acc,1); break; }
    }
  }
};

Sim.prototype.seek=function(x,y,g,range){
  var t=this.t, row=y*GW, row2=(y+g)*GW, best=0,bk=99; range=range||6;
  for(var dir=-1;dir<=1;dir+=2){
    for(var k=1;k<=range;k++){
      var cx=x+dir*k; if(cx<1||cx>=GW-1)break;
      if(t[row+cx]!==E)break;
      if(t[row2+cx]===E){ if(k<bk||(k===bk&&this.rand()<0.5)){bk=k;best=dir;} break; }
    }
  }
  return best;
};

function dens(c){ return c===STEEL?2:(c===FOAM?0.5:1); }

Sim.prototype.stepOnce=function(){
  var t=this.t,c=this.c,vx=this.vx,g=this.g,moved=0,rand=this.rand;
  var zn=this.zn, hk=this.hasKinds, y0,y1,dy;
  if(g===1){y0=GH-2;y1=0;dy=-1;} else {y0=1;y1=GH-1;dy=1;}
  var flip=this.frame&1, fr=this.frame;
  for(var y=y0;y!==y1;y+=dy){
    var row=y*GW;
    for(var k=1;k<GW-1;k++){
      var x=flip?GW-1-k:k, i=row+x;
      if(t[i]!==S)continue;
      if(t[i-1]===LAVA||t[i+1]===LAVA||t[i-GW]===LAVA||t[i+GW]===LAVA){
        t[i]=E; this.burned++; if(this.fx.length<60)this.fx.push({type:'burn',x:x,y:y}); continue;
      }
      var ci=c[i], kind=0, fast=false;
      if(zn){
        var z=zn[i];
        if(z){
          if(z===1){ if((fr+x*3+y)&1) continue; }
          else if(z===2||z===3){
            if(rand()<0.55){ var sw=(z===2)?1:-1; if(t[i+sw]===E){ t[i+sw]=S;c[i+sw]=ci;vx[i+sw]=0; t[i]=E; moved++; continue; } }
          } else if(z===4){ fast=true; }
        }
      }
      if(hk&&ci>=STEEL){
        kind=ci;
        if(kind===FOAM){
          if(rand()<0.3){ var sd=rand()<0.5?1:-1; if(t[i+sd]===E){ t[i+sd]=S;c[i+sd]=ci;vx[i+sd]=0; t[i]=E; moved++; continue; } }
          if(rand()<0.25) continue;
        }
      }
      var j=i+g*GW;
      if(t[j]===E){
        t[j]=S;c[j]=ci;vx[j]=vx[i]; t[i]=E; moved++;
        if(kind===STEEL||fast){ var j2=j+g*GW; if(t[j2]===E){ t[j2]=S;c[j2]=ci;vx[j2]=0; t[j]=E; } }
        continue;
      }
      var below=t[j];
      if(SOLID[below]){
        var v=vx[i];
        if(kind===MUD&&rand()>0.08)continue;
        if(v===0){ v=this.seek(x,y,g,CFG.slideRange); vx[i]=v; }
        if(v!==0){
          if(t[i+v]===E){
            var jd=j+v;
            if(t[jd]===E){ t[jd]=S;c[jd]=ci;vx[jd]=v; t[i]=E; moved++; continue; }
            var ni=i+v; t[ni]=S;c[ni]=ci;vx[ni]=(rand()<0.06)?0:v; t[i]=E; moved++; continue;
          }
          vx[i]=0;
        }
        continue;
      }
      if(hk&&below===S&&ci>=STEEL||hk&&below===S&&c[j]===FOAM){
        var cb=c[j];
        if(dens(ci)>dens(cb)+0.01&&rand()<0.5){ c[i]=cb; c[j]=ci; vx[i]=0; vx[j]=0; moved++; continue; }
      }
      if(kind===MUD&&rand()>0.1)continue;
      var s=rand()<0.5?1:-1;
      if(t[j+s]===E&&t[i+s]===E){ var a=j+s; t[a]=S;c[a]=ci;vx[a]=0; t[i]=E; moved++; }
      else if(t[j-s]===E&&t[i-s]===E){ var b=j-s; t[b]=S;c[b]=ci;vx[b]=0; t[i]=E; moved++; }
      else {
        vx[i]=0;
        if(below===S&&rand()<(kind===MUD?0.05:0.6)){
          var d=this.seek(x,y,g,4);
          if(d!==0&&t[i+d]===E){ var ni2=i+d; t[ni2]=S;c[ni2]=ci;vx[ni2]=0; t[i]=E; moved++; }
        }
      }
    }
  }
  return moved;
};

Sim.prototype.emittedAll=function(){ return this.emitted>=this.total; };

Sim.prototype.stars=function(){
  var rs=(this.total-this.emitted)/this.total;
  /* yıldız, bölümün asıl (çarpansız) çizgi hakkına göre hesaplanır; fazladan verilen hak bölümü geçmeyi kolaylaştırır ama yıldızı ucuzlatmaz */
  var base=this.L.inkStar||this.ink, ri=base>0?Math.max(0,(base-this.inkUsed)/base):1;
  var sc=(rs+ri)/2;
  var t3=this.L.t3||0.35, t2=this.L.t2||0.15;
  return {score:sc,stars:sc>t3?3:sc>t2?2:1,remSand:rs,remInk:ri};
};

Sim.prototype.finish=function(kind){
  this.state=kind;
  if(kind==='win'){ var s=this.stars(); this.result={win:true,stars:s.stars,score:s.score,remSand:s.remSand,remInk:s.remInk}; }
  else this.result={win:false};
};

Sim.prototype.step=function(){
  if(this.state!=='run')return;
  if(this.movers.length)this.updateMovers();
  this.emit();
  var m=this.stepOnce(); this.frame++; m+=this.stepOnce();
  if(m===0)this.noMove++; else this.noMove=0;
  if(this.frame%3===0){
    if(this.evalCups()){this.winHold+=3;this.sealed=true;} else {this.winHold=0;this.sealed=false;}
    if(this.winHold>=45){ this.finish('win'); return; }
    var sum=0; for(var q=0;q<this.cups.length;q++)sum+=this.cups[q].match;
    if(sum>this.bestMatch){ this.bestMatch=sum; this.lastProgress=this.frame; }
  }
  if(this.emitted!==this.lastEmitted){ this.lastEmitted=this.emitted; this.lastEmitFrame=this.frame; }
  /* çevirme hakkı varken oyuncuya ⇅ için zaman tanınır (kum durduktan ~5 sn sonra kayıp) */
  var canFlip=this.flipsLeft>0, settle=canFlip?300:90;
  if(this.noMove>=settle&&!this.movers.length||this.noMove>=240+(canFlip?60:0)){
    var done=this.emittedAll();
    if(this.g===1&&(done||this.noMove>=150)) this.finish('fail');
    else if(this.g===-1&&this.flipsLeft===0) this.finish('fail');
  }
  /* kum hiç durmasa da (rüzgâr, hafif kum) ilerleme yoksa bölüm biter: ~15 sn hedefte artış ve döküm yoksa kayıp */
  if(this.state==='run'&&(this.g===1||!canFlip)&&this.frame-this.lastProgress>900&&this.frame-this.lastEmitFrame>900)this.finish('fail');
  if(this.state==='run'&&this.movers.length&&this.frame>5400)this.finish('fail');
};

var API={Sim:Sim,rng:rng,CFG:CFG,W:W,H:H,CELL:CELL,GW:GW,GH:GH,E:E,S:S,WALL:WALL,LAVA:LAVA,DRAW:DRAW,MW:MW,RED:RED,BLUE:BLUE,STEEL:STEEL,FOAM:FOAM,MUD:MUD};
if(typeof module!=='undefined'&&module.exports)module.exports=API; else root.KD=API;
})(typeof window!=='undefined'?window:globalThis);
