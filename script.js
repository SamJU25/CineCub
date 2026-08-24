'use strict';

/* ================================================================
   00. UI SCROLL LOCK HELPER (FIXES THE PAGE BLINK/SHIFT)
================================================================ */
var UIHelper = {
  lockScroll: function() {
    if (document.body.style.overflow === 'hidden') return;
    var scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = scrollBarWidth + 'px';
    document.body.style.overflow = 'hidden';
  },
  unlockScroll: function() {
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';
  }
};

/* ================================================================
   01. CONFIGURATION
================================================================ */
const CFG = {
  BASE:    '/api/tmdb',
  IMG185:  'https://image.tmdb.org/t/p/w185',
  IMG342:  'https://image.tmdb.org/t/p/w342',
  IMG500:  'https://image.tmdb.org/t/p/w500',
  ORIG:    'https://image.tmdb.org/t/p/original',
  SERVERS: [
    { name: 'VidLink', icon: 'fa-play-circle',
      movie: function(id){ return 'https://vidlink.pro/movie/'+id; },
      tv:    function(id,s,e){ return 'https://vidlink.pro/tv/'+id+'/'+s+'/'+e; } },
    { name: 'VidSrc', icon: 'fa-server',
      movie: function(id){ return 'https://vidsrc.me/embed/movie?tmdb='+id; },
      tv:    function(id,s,e){ return 'https://vidsrc.me/embed/tv?tmdb='+id+'&season='+s+'&episode='+e; } },
    { name: 'AutoEmbed', icon: 'fa-film',
      movie: function(id){ return 'https://autoembed.co/movie/tmdb/'+id; },
      tv:    function(id,s,e){ return 'https://autoembed.co/tv/tmdb/'+id+'-'+s+'-'+e; } }
  ],
  SPOTLIGHT_INTERVAL: 6000,
  GENRES: [
    {id:28,name:'Action'},{id:35,name:'Comedy'},{id:27,name:'Horror'},{id:878,name:'Sci-Fi'},
    {id:18,name:'Drama'},{id:10749,name:'Romance'},{id:80,name:'Crime'},{id:16,name:'Animation'},
    {id:14,name:'Fantasy'},{id:53,name:'Thriller'},{id:12,name:'Adventure'},{id:9648,name:'Mystery'}
  ],
  GENRE_MAP: {28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',18:'Drama',10751:'Family',14:'Fantasy',27:'Horror',9648:'Mystery',10749:'Romance',878:'Sci-Fi',53:'Thriller'}
};

/* ================================================================
   02. STATE & UTILS
================================================================ */
var State = { activePage:'page-home', browseType:'movie', browseMode:'trending', genreId:null, activeId:null, activeType:'movie', activeData:null, activeServer:0, watchlist:[], history:[] };

var Utils = {
  year: function(d){ return d ? d.split('-')[0] : 'N/A'; },
  runtime: function(m){ if(!m) return 'N/A'; var h=Math.floor(m/60), mins=m%60; return h ? h+'h '+(mins?mins+'m':'') : mins+'m'; },
  genreNames: function(ids){ return (ids||[]).slice(0,2).map(function(id){ return CFG.GENRE_MAP[id]||''; }).filter(Boolean).join(', ') || 'General'; },
  placeholder: function(){ return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22%3E%3Crect fill=%22%2312121e%22 width=%22300%22 height=%22450%22/%3E%3C/svg%3E'; },
  escape: function(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); },
  jsAttr: function(s){ return JSON.stringify(String(s == null ? '' : s)).replace(/"/g,'&quot;'); }
};

var API = {
  url: function(endpoint, params){
    var query = new URLSearchParams(params || {});
    var qs = query.toString();
    return CFG.BASE + endpoint + (qs ? '?' + qs : '');
  },
  fetch: async function(url){
    try {
      var r = await fetch(url, {credentials:'omit'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      return await r.json();
    } catch(err) {
      console.error('TMDB request failed:', err);
      return null;
    }
  },
  trending: function(type){ return API.fetch(API.url('/trending/'+(type||'all')+'/week',{page:1})); },
  topRated: function(type){ return API.fetch(API.url('/'+(type||'movie')+'/top_rated',{page:1})); },
  popular:  function(type){ return API.fetch(API.url('/'+(type||'movie')+'/popular',{page:1})); },
  upcoming: function(){ return API.fetch(API.url('/movie/upcoming',{page:1})); },
  search:   function(q){ return API.fetch(API.url('/search/multi',{query:q,page:1,include_adult:false})); },
  detail:   function(id,type){ return API.fetch(API.url('/'+(type||'movie')+'/'+id,{append_to_response:'credits'})); },
  discover: function(type,params){ return API.fetch(API.url('/discover/'+(type||'movie'),params)); }
};

var Prog = {
  el:null, bar:null,
  init: function(){ this.el=document.getElementById('cv-progress'); this.bar=document.getElementById('cv-progress-bar'); },
  start: function(){ if(!this.el) return; this.bar.style.width='0%'; this.el.classList.add('active'); setTimeout(()=>{ this.bar.style.width='75%'; },50); },
  done: function(){ if(!this.el) return; this.bar.style.width='100%'; setTimeout(()=>{ this.el.classList.remove('active'); this.bar.style.width='0%'; },400); }
};

var Toast = {
  show: function(msg, type){
    var c = document.getElementById('toast-container'); if(!c) return;
    var t = document.createElement('div'); t.className='toast';
    var icon = document.createElement('i');
    var iconClass = type==='error' ? 'fa-exclamation-circle' : (type==='success' ? 'fa-check-circle' : 'fa-info-circle');
    var iconColor = type==='error' ? 'var(--cv-red)' : (type==='success' ? 'var(--cv-green)' : 'var(--cv-purple-light)');
    icon.className='fas '+iconClass; icon.style.color=iconColor;
    var text=document.createElement('span'); text.textContent=String(msg==null?'':msg);
    t.appendChild(icon); t.appendChild(text); c.appendChild(t);
    setTimeout(function(){ t.style.opacity=0; setTimeout(function(){t.remove();},300); },3000);
  }
};

/* ================================================================
   03. UI NAVIGATION & INTERACTION
================================================================ */
var Sidebar = {
  collapsed:false,
  toggle: function(e){
    if(e) e.preventDefault();
    if(window.innerWidth <= 768) {
      this.close();
      return;
    }
    this.collapsed = !this.collapsed;
    var cls = this.collapsed ? 'add' : 'remove';
    document.getElementById('cv-sidebar').classList[cls]('collapsed');
    document.getElementById('cv-main').classList[cls]('sidebar-collapsed');
    document.getElementById('cv-header').classList[cls]('sidebar-collapsed');
  },
  open: function(){ document.getElementById('cv-sidebar').classList.add('mobile-open'); document.getElementById('sidebar-overlay').classList.add('open'); },
  close: function(){ document.getElementById('cv-sidebar').classList.remove('mobile-open'); document.getElementById('sidebar-overlay').classList.remove('open'); }
};

var MobNav = {
  set: function(el){
    document.querySelectorAll('.mbb-btn').forEach(b => b.classList.remove('active'));
    if(el) el.classList.add('active');
  }
};

var App = {
  showPage: function(id){
    State.activePage = id;
    document.querySelectorAll('.cv-page').forEach(function(p){ p.classList.remove('active'); });
    var page=document.getElementById(id); if(page) page.classList.add('active');
    window.scrollTo({top:0}); Sidebar.close();
  },
  setNav: function(id, title){
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    var navEl = document.getElementById(id); if(navEl) navEl.classList.add('active');
    document.getElementById('header-page-title').textContent = title;
    document.getElementById('breadcrumb-current').textContent = title;
  },
  goHome: function(){ this.showPage('page-home'); this.setNav('nav-home','Discover'); },
  browseMovies: function(){ State.browseType='movie'; State.browseMode='popular'; this.showPage('page-browse'); this.setNav('nav-movies','Movies'); Browse.load(); },
  browseTVShows: function(){ State.browseType='tv'; State.browseMode='popular'; this.showPage('page-browse'); this.setNav('nav-tv','TV Shows'); Browse.load(); },
  browseTrending: function(){ State.browseType='all'; State.browseMode='trending'; this.showPage('page-browse'); this.setNav('nav-trending','Trending'); Browse.load(); },
  browseTopRated: function(){ State.browseType='movie'; State.browseMode='toprated'; this.showPage('page-browse'); this.setNav('nav-toprated','Top Rated'); Browse.load(); },
  browseUpcoming: function(){ State.browseType='movie'; State.browseMode='upcoming'; this.showPage('page-browse'); this.setNav('nav-upcoming','Upcoming'); Browse.load(); },
  showWatchlist: function(){
    if(!Auth.isLoggedIn()){ Toast.show('Please sign in to view your Watchlist.','error'); Auth.open('login'); return; }
    this.showPage('page-watchlist'); this.setNav('nav-watchlist','Watchlist'); Watchlist.render();
  },
  showHistory: function(){
    if(!Auth.isLoggedIn()){ Toast.show('Please sign in to view your Watch History.','error'); Auth.open('login'); return; }
    this.showPage('page-history'); this.setNav('nav-history','History'); History.render();
  },
  shareCurrent: function(){
    var d=State.activeData; if(!d) return;
    var params=new URLSearchParams({id:String(State.activeId),type:String(State.activeType)});
    var shareUrl=window.location.origin+window.location.pathname+'?'+params.toString();
    var title=d.title||d.name||'Movie';
    function fallback(){
      var ta=document.createElement('textarea'); ta.value=shareUrl; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try{document.execCommand('copy');Toast.show('Link copied to clipboard.','success');}
      catch(e){Toast.show('Unable to copy the link.','error');}
      ta.remove();
    }
    if(navigator.share){navigator.share({title:title,text:'Watch '+title+' on StreamHeavens',url:shareUrl}).catch(function(err){if(err&&err.name!=='AbortError')fallback();});}
    else if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(shareUrl).then(function(){Toast.show('Link copied to clipboard.','success');}).catch(fallback);}
    else fallback();
  }
};

/* Search Module */
var Search = {
  timer: null,
  onInput: function(q){
    clearTimeout(this.timer);
    var d = document.getElementById('search-dropdown');
    if(!q || !q.trim()){ d.classList.remove('open'); return; }
    d.classList.add('open');
    document.getElementById('srd-results').innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-3);">Searching TMDB...</div>';
    this.timer = setTimeout(()=>{ this.doSearch(q); }, 400);
  },
  doSearch: function(q){
    API.search(q).then(data => {
      var r = ((data && data.results) || []).filter(x => x.poster_path && x.media_type!=='person').slice(0,6);
      if(!r.length){ document.getElementById('srd-results').innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-3);">No results found.</div>'; return; }
      document.getElementById('srd-results').innerHTML = r.map(item => {
        var t = item.media_type||'movie';
        return '<div class="srd-item" onclick="Modal.openFull('+item.id+',\''+t+'\')">'
          + '<img class="srd-poster" src="'+CFG.IMG185+item.poster_path+'" loading="lazy" decoding="async" alt="'+Utils.escape(item.title||item.name)+'"/>'
          + '<div class="srd-info"><div class="srd-title">'+Utils.escape(item.title||item.name)+'</div><div class="srd-meta">'+Utils.year(item.release_date||item.first_air_date)+' &middot; '+t.toUpperCase()+'</div></div></div>';
      }).join('');
    });
  },
  closeDropdown: function(){ document.getElementById('search-dropdown').classList.remove('open'); },
  focusMobile: function(){
    window.scrollTo({top:0,behavior:'smooth'});
    document.getElementById('search-input').focus();
  }
};

/* ================================================================
   04. HERO SPOTLIGHT SLIDER
================================================================ */
var Spotlight = {
  current:0, items:[], timer:null,
  init: function(data){
    if(!data || !data.length) return;
    this.items = data;
    var t = document.getElementById('spotlight-track');
    var th = document.getElementById('spotlight-thumbstrip');
    var d = document.getElementById('spotlight-dots');
    t.innerHTML = data.map((x,i) => {
      var type = x.media_type||(x.title?'movie':'tv');
      var title = x.title||x.name;
      var rating = x.vote_average ? x.vote_average.toFixed(1) : '8.2';
      var year = Utils.year(x.release_date||x.first_air_date);
      var genres = Utils.genreNames(x.genre_ids);
      var inWl = State.watchlist.some(function(w){return w.id===x.id;});
      var wlClass = inWl ? ' in-list' : '';
      var wlIcon = inWl ? 'fa-check' : 'fa-heart';
      return '<div class="spotlight-slide" id="slide-'+i+'">'
        + '<div class="spotlight-bg" style="background-image:url('+CFG.ORIG+x.backdrop_path+')"></div>'
        + '<div class="spotlight-content">'
        + '<div class="spotlight-category"><span class="spotlight-category-dot"></span>'+(type==='tv'?'TV Series':'Feature Film')+' &middot; '+year+'</div>'
        + '<h1 class="spotlight-title">'+Utils.escape(title)+'</h1>'
        + '<div class="spotlight-meta">'
        + '<span><i class="fas fa-star"></i> '+rating+'</span>'
        + '<span>&bull;</span><span><i class="fas fa-clock"></i> ~2h</span>'
        + '<span>&bull;</span><span>'+genres+'</span>'
        + '<span class="spotlight-quality">4K HD</span>'
        + '</div>'
        + '<p class="spotlight-desc">'+Utils.escape(x.overview||'No description available.')+'</p>'
        + '<div class="spotlight-actions">'
        + '<button class="btn-spotlight-play" onclick="Modal.openFull('+x.id+',\''+type+'\')"><i class="fas fa-play"></i> Watch Now</button>'
        + '<button class="btn-spotlight-info" onclick="Modal.openFull('+x.id+',\''+type+'\')"><i class="fas fa-info-circle"></i> More Info</button>'
        + '<button class="btn-spotlight-wl'+wlClass+' wl-btn-'+x.id+'" title="'+(inWl?'Remove from watchlist':'Add to watchlist')+'" onclick="Watchlist.toggleById(event,'+x.id+','+Utils.jsAttr(type)+','+Utils.jsAttr(title)+','+Utils.jsAttr(x.poster_path||'')+','+Number(x.vote_average||0)+','+Utils.jsAttr(x.release_date||x.first_air_date||'')+')"><i class="fas '+wlIcon+'"></i></button>'
        + '</div></div></div>';
    }).join('');
    
    th.innerHTML = data.map((x,i) => '<div class="spotlight-thumb '+(i===0?'active':'')+'" onclick="Spotlight.goTo('+i+')"><img src="'+CFG.IMG185+x.backdrop_path+'"/></div>').join('');
    d.innerHTML = data.map((x,i) => '<div class="spotlight-dot '+(i===0?'active':'')+'" onclick="Spotlight.goTo('+i+')"></div>').join('');
    this.goTo(0); this.startAuto();
  },
  goTo: function(idx){
    this.current = idx;
    var tr = document.getElementById('spotlight-track');
    if(tr) tr.style.transform = 'translateX(-'+(idx*100)+'%)';
    document.querySelectorAll('.spotlight-slide').forEach((s,i) => s.classList.toggle('active', i===idx));
    document.querySelectorAll('.spotlight-thumb').forEach((t,i) => t.classList.toggle('active', i===idx));
    document.querySelectorAll('.spotlight-dot').forEach((d,i) => d.classList.toggle('active', i===idx));
    this.resetProgress();
  },
  next: function(){ this.goTo((this.current+1) % this.items.length); },
  prev: function(){ this.goTo((this.current-1+this.items.length) % this.items.length); },
  startAuto: function(){ clearInterval(this.timer); this.timer = setInterval(()=>this.next(), CFG.SPOTLIGHT_INTERVAL); this.resetProgress(); },
  resetProgress: function(){
    var pb = document.getElementById('spotlight-progress-bar');
    if(!pb) return;
    pb.classList.remove('animating');
    void pb.offsetWidth;
    pb.classList.add('animating');
  }
};

/* ================================================================
   05. DRAG & SLIDE ANIMATION FOR HORIZONTAL CAROUSELS
================================================================ */
function initDragScroll(){
  document.querySelectorAll('.cv-hscroll').forEach(function(el){
    if (el.dataset.dragInit === 'true') return; 
    el.dataset.dragInit = 'true';
    
    var isDown = false, startX, scrollLeft;
    el.addEventListener('mousedown', function(e){
      isDown = true;
      el.classList.add('dragging');
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    });
    el.addEventListener('mouseleave', function(){ isDown = false; el.classList.remove('dragging'); });
    el.addEventListener('mouseup', function(){ isDown = false; el.classList.remove('dragging'); });
    el.addEventListener('mousemove', function(e){
      if(!isDown) return;
      e.preventDefault();
      var x = e.pageX - el.offsetLeft;
      var walk = (x - startX) * 2;
      el.scrollLeft = scrollLeft - walk;
    });
  });
}

/* ================================================================
   06. RENDERING & DATA ENGINE
================================================================ */
var Render = {
  posterCard: function(item, type){
    if(!item) return '';
    var mType = type||item.media_type||(item.title?'movie':'tv');
    var title = item.title||item.name||'Untitled';
    var img = item.poster_path ? CFG.IMG342+item.poster_path : Utils.placeholder();
    var rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    var year = Utils.year(item.release_date||item.first_air_date);
    var genre = Utils.genreNames(item.genre_ids);
    var isNew = item.release_date && (new Date(item.release_date) > new Date(Date.now()-60*24*60*60*1000));
    var badge = isNew ? '<span class="pc-badge pc-badge-new">NEW</span>' : '<span class="pc-badge pc-badge-quality">'+(mType==='tv'?'SERIES':'HD')+'</span>';
    var inWl = State.watchlist.some(function(w){return w.id===item.id;});
    var wlClass = inWl?'in-list':''; var wlIcon=inWl?'fa-check':'fa-heart';
    return '<div class="poster-card" onclick="Modal.openFull('+item.id+', '+Utils.jsAttr(mType)+')">'
      + '<div class="poster-card-img-wrap">'
      + '<img class="poster-card-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'"/>'
      + '<div class="poster-card-grad"></div>'
      + '<div class="poster-card-top">'+badge+'<span class="pc-rating"><i class="fas fa-star"></i>'+rating+'</span></div>'
      + '<div class="pc-play-wrap"><div class="pc-play-btn"><i class="fas fa-play"></i></div></div>'
      + '<div class="pc-wl-btn wl-btn-'+item.id+' '+wlClass+'" title="'+(inWl?'Remove from watchlist':'Add to watchlist')+'" onclick="Watchlist.toggleById(event,'+item.id+','+Utils.jsAttr(mType)+','+Utils.jsAttr(title)+','+Utils.jsAttr(item.poster_path||'')+','+Number(item.vote_average||0)+','+Utils.jsAttr(item.release_date||item.first_air_date||'')+')"><i class="fas '+wlIcon+'"></i></div>'
      + '</div>'
      + '<div class="poster-card-info"><div class="pc-title" title="'+Utils.escape(title)+'">'+Utils.escape(title)+'</div><div class="pc-meta"><span>'+year+'</span><span class="pc-genre">'+Utils.escape(genre.split(',')[0])+'</span>'+(item.season?' <span class="pc-genre">S'+item.season+(item.episode?' E'+item.episode:'')+'</span>':'')+'</div></div>'
      + '</div>';
  },
  landscapeCard: function(item, type){
    if(!item) return '';
    var mType=type||'movie'; var title=item.title||item.name||'Untitled';
    var img=item.backdrop_path?CFG.IMG500+item.backdrop_path:(item.poster_path?CFG.IMG342+item.poster_path:Utils.placeholder());
    var rating=item.vote_average?item.vote_average.toFixed(1):'N/A'; var genre=Utils.genreNames(item.genre_ids);
    var inWl=State.watchlist.some(function(w){return w.id===item.id;}); var wlClass=inWl?'in-list':''; var wlIcon=inWl?'fa-check':'fa-heart';
    return '<div class="landscape-card" onclick="Modal.openFull('+item.id+', '+Utils.jsAttr(mType)+')">'
      + '<div class="lc-img-wrap"><img class="lc-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'"/><div class="lc-overlay"></div>'
      + '<div class="lc-top"><span class="pc-badge pc-badge-quality">'+(mType==='tv'?'SERIES':'MOVIE')+'</span><span class="pc-rating"><i class="fas fa-star"></i>'+rating+'</span></div>'
      + '<div class="pc-play-wrap"><div class="pc-play-btn"><i class="fas fa-play"></i></div></div>'
      + '<div class="pc-wl-btn wl-btn-'+item.id+' '+wlClass+'" title="'+(inWl?'Remove from watchlist':'Add to watchlist')+'" onclick="Watchlist.toggleById(event,'+item.id+','+Utils.jsAttr(mType)+','+Utils.jsAttr(title)+','+Utils.jsAttr(item.poster_path||'')+','+Number(item.vote_average||0)+','+Utils.jsAttr(item.release_date||item.first_air_date||'')+')"><i class="fas '+wlIcon+'"></i></div>'
      + '</div>'
      + '<div class="lc-info"><div class="lc-title">'+Utils.escape(title)+'</div><div class="lc-meta">'+Utils.escape(Utils.year(item.release_date||item.first_air_date))+' &middot; '+Utils.escape(genre)+'</div></div>'
      + '</div>';
  },
  compactCard: function(item, rank){
    if(!item) return '';
    var mType = item.media_type||(item.title?'movie':'tv');
    var title = item.title||item.name;
    var img = item.poster_path ? CFG.IMG185+item.poster_path : Utils.placeholder();
    var rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    var year = Utils.year(item.release_date||item.first_air_date);
    var genre = Utils.genreNames(item.genre_ids);

    return '<div class="compact-card" onclick="Modal.openFull('+item.id+', '+Utils.jsAttr(mType)+')">'
      + '<span class="compact-card-num">'+rank+'</span>'
      + '<img class="compact-card-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'"/>'
      + '<div class="compact-card-info"><div class="compact-card-title">'+Utils.escape(title)+'</div><div class="compact-card-meta">'+year+' &middot; '+genre.split(',')[0]+'</div></div>'
      + '<div class="compact-card-right"><span class="compact-card-rating"><i class="fas fa-star"></i> '+rating+'</span><span style="font-size:11px;color:var(--text-4);">'+(mType==='tv'?'Series':'Movie')+'</span></div>'
      + '</div>';
  },
  skeletons: function(id, count){
    var el = document.getElementById(id); if(!el) return;
    el.innerHTML = Array(count).fill('<div class="skel-poster"></div>').join('');
  }
};

var Browse = {
  load: function(){
    Prog.start(); Render.skeletons('browse-grid', 18);
    var p;
    if(State.browseMode==='trending') p = API.trending(State.browseType);
    else if(State.browseMode==='toprated') p = API.topRated(State.browseType==='all'?'movie':State.browseType);
    else if(State.browseMode==='upcoming') p = API.upcoming();
    else p = API.popular(State.browseType==='all'?'movie':State.browseType);

    p.then(function(data){
      if(data && data.results){
        var items=data.results.filter(function(x){return x.poster_path;});
        document.getElementById('browse-grid').innerHTML=items.map(function(x){return Render.posterCard(x, State.browseType==='all'?null:State.browseType);}).join('')||'<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">No titles found.</div>';
      }else{
        document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load titles right now. Please try again.</div>';
      }
      Prog.done(); initDragScroll();
    }).catch(function(){
      document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load titles right now. Please try again.</div>';
      Prog.done();
    });
  },
  byGenre: function(genreId, name){
    State.browseType = 'movie';
    App.showPage('page-browse');
    App.setNav('nav-movies', name);
    Prog.start(); Render.skeletons('browse-grid', 18);
    
    var params = {with_genres: genreId, page:1};
    
    API.discover(State.browseType, params).then(function(data){
      if(data && data.results){
        var items=data.results.filter(function(x){return x.poster_path;});
        document.getElementById('browse-grid').innerHTML=items.map(function(x){return Render.posterCard(x,State.browseType);}).join('')||'<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">No titles found.</div>';
      }else{
        document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load this genre right now.</div>';
      }
      Prog.done(); initDragScroll();
    }).catch(function(){
      document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load this genre right now.</div>';
      Prog.done();
    });
  }
};

/* ================================================================
   07. MODAL & EMBEDDED STREAMING
================================================================ */
var Modal = {
  isOpening: false, 
  overlayClick: function(e){ if(e.target === document.getElementById('modal-overlay')) this.closeAll(); },
  closeAll: function(){
    document.getElementById('modal-overlay').classList.remove('open');
    UIHelper.unlockScroll();
    
    var iframe = document.getElementById('main-player');
    if (iframe) {
      iframe.src = '';
      iframe.classList.remove('loaded');
    }
  },
  openFull: function(id, type){
    if (this.isOpening) return; 
    this.isOpening = true;
    
    State.activeId = id; State.activeType = type;
    Prog.start();
    API.detail(id, type).then(data => {
      this.isOpening = false; 
      if(!data){ Toast.show('Error loading details.'); Prog.done(); return; }
      State.activeData = data;
      document.getElementById('fv-backdrop').src = CFG.ORIG+(data.backdrop_path||data.poster_path);
      document.getElementById('fv-poster').src = CFG.IMG342+data.poster_path;
      document.getElementById('fv-title').textContent = data.title||data.name;
      document.getElementById('fv-year').textContent = Utils.year(data.release_date||data.first_air_date);
      document.getElementById('fv-rating').textContent = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
      document.getElementById('fv-desc').textContent = data.overview;
      document.getElementById('fv-genre').textContent = (data.genres||[]).map(x=>x.name).join(', ');
      document.getElementById('fv-runtime').textContent = type==='movie'?Utils.runtime(data.runtime):((data.number_of_seasons||1)+' Season(s)');
      
      var cast = ((data.credits&&data.credits.cast)||[]).slice(0,10);
      document.getElementById('fv-cast').innerHTML = cast.map(c => '<div class="cast-card"><img class="cast-avatar" src="'+(c.profile_path?CFG.IMG185+c.profile_path:Utils.placeholder())+'"/><div style="font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+Utils.escape(c.name)+'</div></div>').join('');
      
      var epRow = document.getElementById('ep-row');
      if(type==='tv'){
        epRow.className = 'ep-row';
        var seasonsCount = data.number_of_seasons || 1;
        document.getElementById('ep-season').innerHTML = Array.from({length: seasonsCount}, (_,i) => '<option value="'+(i+1)+'">Season '+(i+1)+'</option>').join('');
        document.getElementById('ep-episode').innerHTML = Array.from({length: 24}, (_,i) => '<option value="'+(i+1)+'">Episode '+(i+1)+'</option>').join('');
      } else { 
        epRow.className = 'ep-row hidden';
      }

      document.getElementById('server-tabs').innerHTML = CFG.SERVERS.map((s,i) => '<div class="server-tab '+(i===0?'active':'')+'" onclick="Player.switchServer('+i+', this)"><i class="fas '+s.icon+'"></i> '+s.name+'</div>').join('');
      State.activeServer = 0;

      var fvWl = document.getElementById('fv-wl-btn');
      var fvIcon = fvWl ? fvWl.querySelector('i') : null;
      var alreadyInWl = State.watchlist.some(function(w){return w.id===id;});
      if(fvWl) fvWl.classList.toggle('active-wl', alreadyInWl);
      if(fvIcon){
        fvIcon.classList.toggle('fa-check', alreadyInWl);
        fvIcon.classList.toggle('fa-heart', !alreadyInWl);
      }

      FVTabs.showTab('overview');
      UIHelper.lockScroll();
      document.getElementById('modal-overlay').classList.add('open');
      Prog.done();
    }).catch(err => {
      this.isOpening = false; 
      Toast.show('Error loading details.');
      Prog.done();
    });
  }
};

var Player = {
  switchServer: function(idx, el){
    State.activeServer = idx;
    document.querySelectorAll('.server-tab').forEach(t => t.classList.remove('active'));
    if(el) el.classList.add('active');
    this.loadVideo();
  },
  loadVideo: function(){
    if(!Auth.isLoggedIn()){ Toast.show('Please sign in to watch and save your history.','error'); Auth.open('login'); return; }
    var s=CFG.SERVERS[State.activeServer], url, season=null, episode=null;
    if(State.activeType==='tv'){
      season=Number(document.getElementById('ep-season').value||1);
      episode=Number(document.getElementById('ep-episode').value||1);
      url=s.tv(State.activeId,season,episode);
    }else{ url=s.movie(State.activeId); }
    
    var iframe = document.getElementById('main-player');
    iframe.classList.remove('loaded');
    iframe.onload = function() { 
      iframe.classList.add('loaded'); 
    }; 
    iframe.src = url;
    
    if(State.activeData) History.add(State.activeId,State.activeType,State.activeData.title||State.activeData.name,State.activeData.poster_path,season,episode);
  }
};

var FVTabs = {
  showTab: function(t, el){
    document.querySelectorAll('.fv-tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.fv-tab-pane').forEach(x => x.classList.remove('active'));
    if(el) el.classList.add('active'); 
    else document.querySelector('.fv-tab[onclick*="\''+t+'\'"]').classList.add('active');
    document.getElementById('tab-'+t).classList.add('active');
    if(t==='watch') Player.loadVideo();
  }
};

var Watchlist = {
  toggleCurrent: function(e){
    if(e){e.preventDefault();e.stopPropagation();}
    if(!Auth.isLoggedIn()){Toast.show('Watchlist is available only when signed in.','error');Auth.open('login');return;}
    var d=State.activeData;if(!d)return;
    this.toggleById(e,State.activeId,State.activeType,d.title||d.name,d.poster_path,d.vote_average,d.release_date||d.first_air_date);
  },
  toggleById: function(e,id,type,title,poster,vote,date){
    if(e){e.preventDefault();e.stopPropagation();}
    if(!Auth.isLoggedIn()){Toast.show('Watchlist is available only when signed in.','error');Auth.open('login');return false;}
    var idx=State.watchlist.findIndex(function(x){return x.id===id;});
    var added=false;
    if(idx===-1){State.watchlist.unshift({id:id,type:type,title:title,poster_path:poster,vote_average:vote,release_date:date});added=true;Toast.show('Added to watchlist','success');}
    else{State.watchlist.splice(idx,1);Toast.show('Removed from watchlist','info');}
    Auth.saveUserData();
    document.querySelectorAll('.wl-btn-'+id).forEach(function(btn){
      var icon=btn.querySelector('i');
      btn.classList.toggle('in-list',added);
      btn.setAttribute('title', added ? 'Remove from watchlist' : 'Add to watchlist');
      if(icon){icon.classList.toggle('fa-check',added);icon.classList.toggle('fa-heart',!added);}
    });
    var fv=document.getElementById('fv-wl-btn');
    if(fv && State.activeId===id){
      fv.classList.toggle('active-wl',added);
      fv.setAttribute('title', added ? 'Remove from watchlist' : 'Add to watchlist');
      var fi=fv.querySelector('i');
      if(fi){fi.classList.toggle('fa-check',added);fi.classList.toggle('fa-heart',!added);}
    }
    if(State.activePage==='page-watchlist')this.render();
    return added;
  },
  render: function(){var el=document.getElementById('wl-grid');if(!el)return;el.innerHTML=State.watchlist.map(function(x){return Render.posterCard(x,x.type);}).join('')||'<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">Your watchlist is empty.</div>';}
};

var History = {
  add: function(id,type,title,poster,season,episode){
    if(!Auth.isLoggedIn())return;
    var s=season||null,e=episode||null;
    var idx=State.history.findIndex(function(x){return x.id===id&&x.season===s&&x.episode===e;});
    if(idx>-1)State.history.splice(idx,1);
    State.history.unshift({id:id,type:type,title:title,poster_path:poster,season:s,episode:e,watchedAt:new Date().toISOString()});
    if(State.history.length>50)State.history.pop();
    Auth.saveUserData();
  },
  render: function(){var el=document.getElementById('history-grid');if(!el)return;el.innerHTML=State.history.map(function(x){return Render.posterCard(x,x.type);}).join('')||'<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">Your watch history is empty.</div>';},
  clearAll: function(){if(!Auth.isLoggedIn()){Toast.show('Please sign in to manage Watch History.','error');Auth.open('login');return;}if(!State.history.length){Toast.show('Watch history is already empty.','info');return;}State.history=[];Auth.saveUserData();this.render();Toast.show('History cleared successfully.','success');}
};


/* ================================================================
   08. LEGAL & POLICY MODAL 
================================================================ */
var Legal = {
  content: {
    dmca: { title: 'DMCA Copyright Policy', html: '<p>StreamHeavens respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act (DMCA), we will respond expeditiously to claims of copyright infringement committed using our service.</p><h3>Reporting Copyright Infringement</h3><p>StreamHeavens does not host any media files on its servers. All contents are provided by non-affiliated third parties. If you believe that your copyrighted work is accessible on StreamHeavens without authorization, please submit a DMCA notice including:</p><p>&bull; Identification of the copyrighted work claimed to have been infringed.<br>&bull; The exact URL or location on our site where the material is located.<br>&bull; Your contact information (Name, Email, Phone Number).<br>&bull; A statement of good faith belief that the disputed use is not authorized by the copyright owner.</p><p>Contact our DMCA agent at: <strong>streamheavens.support@gmail.com</strong></p>' },
    privacy: { title: 'Privacy Policy', html: '<p>Your privacy is important to StreamHeavens. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website or application.</p><h3>1. Information We Store</h3><p>We use your browser\'s local storage (`localStorage`) solely to save your local user session, customized watchlist, and watch history so you can pick up right where you left off. We do not sell or share any of this personal preference data with third parties.</p><h3>2. Third-Party Services</h3><p>We utilize the TMDB API for movie and TV show metadata and imagery. Third-party video embedding providers may use cookies or standard web trackers to deliver media streams.</p>' },
    terms: { title: 'Terms of Service', html: '<p>Welcome to StreamHeavens. By accessing or using our website and application, you agree to be bound by these Terms of Service.</p><h3>1. Acceptance of Terms</h3><p>You must be at least 13 years of age to use this platform. By using StreamHeavens, you warrant that you meet this age requirement.</p><h3>2. Third-Party Content Disclaimer</h3><p>StreamHeavens does not host, upload, or stream any video files on its servers. All videos and media content are hosted by external third-party services. We assume no responsibility or liability for the content hosted on third-party servers.</p>' },
    contact: { title: 'Contact Us', html: '<p>Have questions, feedback, or partnership inquiries? We would love to hear from you!</p><h3>Get in Touch</h3><p>You can reach our support team directly via email:<br><br><strong style="font-size:16px; color:var(--cv-purple-light);"><i class="fas fa-envelope"></i> streamheavens.support@gmail.com</strong></p><p>We typically respond to inquiries within 24 to 48 hours.</p>' }
  },
  open: function(type) {
    var data = this.content[type];
    if(!data) return;
    
    if(typeof Sidebar !== 'undefined' && Sidebar.close) Sidebar.close();
    if(typeof Modal !== 'undefined' && Modal.closeAll) Modal.closeAll();
    if(typeof Auth !== 'undefined' && Auth.closeProfile) Auth.closeProfile();

    document.getElementById('legal-modal-title').textContent = data.title;
    document.getElementById('legal-modal-body').innerHTML = data.html;
    
    UIHelper.lockScroll();
    document.getElementById('legal-modal-overlay').classList.add('open');
  },
  close: function() {
    document.getElementById('legal-modal-overlay').classList.remove('open');
    UIHelper.unlockScroll();
  },
  overlayClick: function(e) {
    if(e.target === document.getElementById('legal-modal-overlay')) this.close();
  }
};


/* ================================================================
   09. AUTHENTICATION / PROFILE
   Browser-only account system
================================================================ */
var Auth = (function(){
  var USERS_KEY = 'sh_users_v1';
  var SESSION_KEY = 'sh_session_v1';
  var WATCH_KEY = 'sh_watchlist_v1';
  var HISTORY_KEY = 'sh_history_v1';
  var recoveryUserId = null;

  function safeParse(key, fallback){
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e) {
      console.error('Storage error:', e);
      return fallback;
    }
  }

  function getUsers(){
    var users = safeParse(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
  }

  function saveUsers(users){
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSession(){
    var session = safeParse(SESSION_KEY, null);
    return session && session.id && session.username ? session : null;
  }
  function userKey(base,user){ return base+'_'+String((user&&user.id)||'guest').replace(/[^a-zA-Z0-9_-]/g,'_'); }
  function loadUserData(user){
    if(!user){State.watchlist=[];State.history=[];return;}
    var wl=safeParse(userKey(WATCH_KEY,user),[]);var hi=safeParse(userKey(HISTORY_KEY,user),[]);
    State.watchlist=Array.isArray(wl)?wl:[];State.history=Array.isArray(hi)?hi:[];
  }
  function saveUserData(){
    var user=getSession();if(!user)return;
    try{localStorage.setItem(userKey(WATCH_KEY,user),JSON.stringify(State.watchlist));localStorage.setItem(userKey(HISTORY_KEY,user),JSON.stringify(State.history));}
    catch(e){console.error('Unable to save user media data:',e);}
  }


  function normalizeUsername(v){
    return (v || '').trim().toLowerCase();
  }

  function normalizeEmail(v){
    return (v || '').trim().toLowerCase();
  }

  function initials(name){
    var n = (name || 'G').trim();
    if(!n) return 'G';
    var parts = n.split(/\s+/);
    return (parts.length > 1 ? parts[0].charAt(0)+parts[parts.length-1].charAt(0) : parts[0].substring(0,2)).toUpperCase();
  }

  function validPassword(password){ return password && password.length >= 4; }

  function setMessage(text, type){
    var el=document.getElementById('auth-message');if(!el)return;
    el.className='auth-message show '+(type||'error');el.textContent='';
    var icon=document.createElement('i');icon.className='fas '+(type==='success'?'fa-circle-check':'fa-circle-exclamation');el.appendChild(icon);
    el.appendChild(document.createTextNode(' '+String(text==null?'':text)));
  }

  function clearMessage(){
    var el = document.getElementById('auth-message');
    if(el){ el.className='auth-message'; el.textContent=''; }
  }

  async function hashPassword(password, saltBase64){
    if(!window.crypto || !window.crypto.subtle) throw new Error('Secure password hashing is not supported by this browser.');
    var salt = saltBase64 ? Uint8Array.from(atob(saltBase64), function(c){return c.charCodeAt(0);}) : crypto.getRandomValues(new Uint8Array(16));
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), {name:'PBKDF2'}, false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:salt, iterations:120000, hash:'SHA-256'}, key, 256);
    var bytes = new Uint8Array(bits);
    var hash = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
    return {
      hash: hash,
      salt: saltBase64 || btoa(String.fromCharCode.apply(null, Array.from(salt)))
    };
  }

  async function verifyPassword(password, user){
    var result = await hashPassword(password, user.salt);
    return result.hash === user.passwordHash;
  }

  function open(mode){
    var overlay = document.getElementById('auth-overlay');
    var popup = document.getElementById('profile-popup');
    if(!overlay) return;

    if(popup) popup.classList.remove('open');
    clearMessage();

    document.querySelectorAll('#auth-overlay .auth-step').forEach(function(x){ x.classList.remove('active'); });

    var step = document.getElementById('auth-'+mode+'-step');
    if(!step) step = document.getElementById('auth-login-step');
    if(step) step.classList.add('active');

    if(mode==='forgot'){
      var verify = document.getElementById('forgot-verify');
      var reset = document.getElementById('forgot-reset');
      if(verify) verify.classList.add('active');
      if(reset) reset.classList.remove('active');
      recoveryUserId = null;
    }

    if (!overlay.classList.contains('open')) {
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          UIHelper.lockScroll();
          overlay.classList.add('open');
        });
      });
    }

    setTimeout(function(){
      var first = step && step.querySelector('input');
      if(first) first.focus();
    }, 120);
  }

  function close(){
    var overlay = document.getElementById('auth-overlay');
    if(overlay) overlay.classList.remove('open');
    UIHelper.unlockScroll();
    recoveryUserId = null;
    clearMessage();
  }

  function overlayClick(e){
    if(e.target === document.getElementById('auth-overlay')) close();
  }

  function toggleProfile(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }

    var overlay = document.getElementById('auth-overlay');
    var popup = document.getElementById('profile-popup');
    if(!popup) return;

    if(overlay && overlay.classList.contains('open')){
      close();
      requestAnimationFrame(function(){
        popup.classList.add('open');
      });
      return;
    }

    var willOpen = !popup.classList.contains('open');
    closeProfile();
    if(willOpen) popup.classList.add('open');
  }

  function closeProfile(){
    var popup = document.getElementById('profile-popup');
    if(popup) popup.classList.remove('open');
  }

  function togglePassword(id, btn){
    var input = document.getElementById(id);
    if(!input) return;
    var showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    if(btn) btn.innerHTML = '<i class="fas '+(showing?'fa-eye':'fa-eye-slash')+'"></i>';
  }

  function updateUI(){
    var user = getSession();
    var trigger = document.getElementById('profile-trigger');
    var side = document.getElementById('sidebar-user');
    var sideAvatar = document.getElementById('sidebar-avatar');
    var sideName = document.getElementById('sidebar-user-name');
    var sideSub = document.getElementById('sidebar-user-sub');
    var popAvatar = document.getElementById('profile-popup-avatar');
    var popTitle = document.getElementById('profile-popup-title');
    var popEmail = document.getElementById('profile-popup-email');
    var activeBadge = document.getElementById('profile-active-badge');
    var popBody = document.getElementById('profile-popup-body');

    if(user){
      var init = initials(user.username);
      if(trigger){ trigger.textContent = init; trigger.classList.remove('logged-out'); trigger.title = user.username; }
      if(side){ side.classList.remove('guest'); }
      if(sideAvatar) sideAvatar.textContent = init;
      if(sideName) sideName.textContent = user.username;
      if(sideSub) sideSub.textContent = 'Active Session';
      if(popAvatar) popAvatar.textContent = init;
      if(popTitle) popTitle.textContent = user.username;
      if(popEmail) popEmail.textContent = user.email;
      if(activeBadge) activeBadge.style.display = 'inline-flex';
      if(popBody) popBody.innerHTML =
        '<button type="button" class="profile-popup-btn" onclick="event.preventDefault(); event.stopPropagation(); App.showWatchlist(); Auth.closeProfile();"><i class="fas fa-heart"></i><span>My Watchlist</span></button>'+
        '<button type="button" class="profile-popup-btn" onclick="event.preventDefault(); event.stopPropagation(); App.showHistory(); Auth.closeProfile();"><i class="fas fa-history"></i><span>Watch History</span></button>'+
        '<button type="button" class="profile-popup-btn" onclick="event.preventDefault(); event.stopPropagation(); Auth.open(\'forgot\')"><i class="fas fa-key"></i><span>Reset Password</span></button>'+
        '<button type="button" class="profile-popup-btn danger" onclick="event.preventDefault(); event.stopPropagation(); Auth.logout();"><i class="fas fa-right-from-bracket"></i><span>Logout</span></button>';
    } else {
      if(trigger){ trigger.textContent='G'; trigger.classList.add('logged-out'); trigger.title='Login / Sign Up'; }
      if(side){ side.classList.add('guest'); }
      if(sideAvatar) sideAvatar.textContent='G';
      if(sideName) sideName.textContent='Guest Mode';
      if(sideSub) sideSub.textContent='Sign in / Sign up';
      if(popAvatar) popAvatar.textContent='G';
      if(popTitle) popTitle.textContent='Guest Mode';
      if(popEmail) popEmail.textContent='You are not signed in';
      if(activeBadge) activeBadge.style.display='none';
      if(popBody) popBody.innerHTML =
        '<div class="profile-guest-text">Sign in to manage your account and keep your session on this browser.</div>'+
        '<div class="profile-popup-actions">'+
          '<button type="button" class="profile-auth-btn primary" onclick="event.preventDefault(); event.stopPropagation(); Auth.open(\'login\')"><i class="fas fa-right-to-bracket"></i> Login</button>'+
          '<button type="button" class="profile-auth-btn secondary" onclick="event.preventDefault(); event.stopPropagation(); Auth.open(\'signup\')"><i class="fas fa-user-plus"></i> Sign Up</button>'+
        '</div>';
    }
  }

  async function signup(e){
    e.preventDefault();
    clearMessage();
    var btn = document.getElementById('signup-submit');
    var username = document.getElementById('signup-username').value.trim();
    var email = normalizeEmail(document.getElementById('signup-email').value);
    var password = document.getElementById('signup-password').value;
    var confirm = document.getElementById('signup-confirm').value;

    if(!/^[A-Za-z0-9_.-]{3,24}$/.test(username)){
      setMessage('Username must be 3\u201324 characters and may contain letters, numbers, dots, underscores, or hyphens.','error'); return;
    }
    if(!validPassword(password)){ setMessage('Password must be at least 4 characters long.','error'); return; }
    if(password !== confirm){ setMessage('Passwords do not match.','error'); return; }

    var users = getUsers();
    var uname = normalizeUsername(username);
    if(users.some(function(u){return normalizeUsername(u.username)===uname;})){
      setMessage('That username is already registered. Please choose another one.','error'); return;
    }
    if(users.some(function(u){return normalizeEmail(u.email)===email;})){
      setMessage('That email address is already registered. Please use another email or reset the existing password.','error'); return;
    }

    try{
      if(btn) btn.disabled=true;
      var hp = await hashPassword(password);
      var user = {
        id:'u_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),
        username:username,
        email:email,
        passwordHash:hp.hash,
        salt:hp.salt,
        createdAt:new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
      localStorage.setItem(SESSION_KEY, JSON.stringify({id:user.id,username:user.username,email:user.email}));
      loadUserData(user);
      updateUI();
      setMessage('Account created successfully. You are now logged in.','success');
      Toast.show('Account created successfully');
      setTimeout(function(){ close(); }, 700);
    }catch(err){
      console.error(err);
      setMessage(err.message || 'Account creation failed. Please try again.','error');
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  async function login(e){
    e.preventDefault();
    clearMessage();
    var btn = document.getElementById('login-submit');
    var identity = document.getElementById('login-identity').value.trim();
    var password = document.getElementById('login-password').value;
    var normalized = identity.toLowerCase();
    var users = getUsers();
    var user = users.find(function(u){
      return normalizeUsername(u.username)===normalized || normalizeEmail(u.email)===normalized;
    });

    if(!user){
      setMessage('Login failed. No account matches that username or email.','error'); return;
    }

    try{
      if(btn) btn.disabled=true;
      var ok = await verifyPassword(password,user);
      if(!ok){
        setMessage('Login failed. The password is incorrect.','error'); return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({id:user.id,username:user.username,email:user.email}));
      loadUserData(user);
      updateUI();
      setMessage('Login successful. Welcome back, '+user.username+'!','success');
      Toast.show('Login successful');
      setTimeout(function(){ close(); }, 700);
    }catch(err){
      console.error(err);
      setMessage('Unable to verify the password. Please try again.','error');
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  function verifyRecovery(e){
    e.preventDefault();
    clearMessage();
    var username = normalizeUsername(document.getElementById('forgot-username').value);
    var email = normalizeEmail(document.getElementById('forgot-email').value);
    var users = getUsers();
    var user = users.find(function(u){
      return normalizeUsername(u.username)===username && normalizeEmail(u.email)===email;
    });

    if(!user){
      setMessage('Recovery failed. The username and registered email address do not match.','error');
      Toast.show('Account details did not match');
      return;
    }

    recoveryUserId = user.id;
    document.getElementById('forgot-verify').classList.remove('active');
    document.getElementById('forgot-reset').classList.add('active');
    document.getElementById('forgot-title').textContent = 'Create a new password';
    document.getElementById('forgot-subtitle').textContent = 'Account verified. Enter and confirm your new password.';
    setMessage('Account verified successfully. You may now reset the password.','success');
    setTimeout(function(){
      var input = document.getElementById('reset-password');
      if(input) input.focus();
    }, 100);
  }

  async function resetPassword(e){
    e.preventDefault();
    clearMessage();
    var p1 = document.getElementById('reset-password').value;
    var p2 = document.getElementById('reset-confirm').value;
    
    if(!validPassword(p1)){ setMessage('New password must be at least 4 characters long.','error'); return; }
    if(p1 !== p2){ setMessage('New passwords do not match.','error'); return; }
    if(!recoveryUserId){ setMessage('Your recovery session expired. Please verify the account again.','error'); return; }

    try{
      var users = getUsers();
      var idx = users.findIndex(function(u){return u.id===recoveryUserId;});
      if(idx===-1){ setMessage('The account could not be found. Please try again.','error'); return; }
      var hp = await hashPassword(p1);
      users[idx].passwordHash = hp.hash;
      users[idx].salt = hp.salt;
      users[idx].updatedAt = new Date().toISOString();
      saveUsers(users);
      localStorage.setItem(SESSION_KEY, JSON.stringify({id:users[idx].id,username:users[idx].username,email:users[idx].email}));
      updateUI();
      setMessage('Password reset successfully. You are now logged in.','success');
      Toast.show('Password reset successful');
      setTimeout(function(){ close(); }, 800);
    }catch(err){
      console.error(err);
      setMessage('Password reset failed. Please try again.','error');
    }
  }

  function logout(){
    try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
    recoveryUserId = null; State.watchlist=[]; State.history=[];
    updateUI(); closeProfile();
    if(State.activePage==='page-watchlist'||State.activePage==='page-history') App.goHome();
    Toast.show('You have been logged out','success');
  }

  function init(){
    loadUserData(getSession());
    updateUI();
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape'){
        closeProfile();
        var overlay=document.getElementById('auth-overlay');
        if(overlay && overlay.classList.contains('open')) close();
      }
    });
    document.addEventListener('click', function(e){
      var popup = document.getElementById('profile-popup');
      var trigger = document.getElementById('profile-trigger');
      var sidebarUser = document.getElementById('sidebar-user');
      var overlay = document.getElementById('auth-overlay');
      if(!popup) return;
      if(overlay && overlay.classList.contains('open')) return;
      if(popup.contains(e.target)) return;
      if(trigger && trigger.contains(e.target)) return;
      if(sidebarUser && sidebarUser.contains(e.target)) return;
      popup.classList.remove('open');
    });
  }

  return {
    init:init, open:open, close:close, overlayClick:overlayClick,
    toggleProfile:toggleProfile, closeProfile:closeProfile,
    togglePassword:togglePassword, signup:signup, login:login,
    verifyRecovery:verifyRecovery, resetPassword:resetPassword, logout:logout,
    isLoggedIn:function(){return !!getSession();}, saveUserData:saveUserData
  };
})();


/* ================================================================
   10. INITIALIZATION
================================================================ */
document.addEventListener('DOMContentLoaded', function(){
  Prog.init();
  Auth.init();
  initDragScroll();

  /* Render Category Chips */
  var chipsHtml = CFG.GENRES.map(function(g){ 
    return '<div class="genre-chip" onclick="Browse.byGenre('+g.id+', \''+g.name+'\')">'+g.name+'</div>'; 
  }).join('');
  document.getElementById('genre-chips').innerHTML = chipsHtml;

  Prog.start();
  Promise.all([
    API.trending('all'),
    API.topRated('movie'),
    API.popular('tv'),
    API.upcoming()
  ]).then(function(res){
    var tr=res[0], rtd=res[1], tv=res[2], up=res[3];
    
    /* 1. Hero Spotlight */
    if(tr && tr.results){
      var spItems = tr.results.filter(x => x.backdrop_path).slice(0,5);
      Spotlight.init(spItems);

      /* 2. Trending Marquee Ticker */
      var tickerHtml = tr.results.slice(0,15).map((x,i) => {
        return '<div class="tr-item" onclick="Modal.openFull('+x.id+',\''+(x.media_type||'movie')+'\')">'
          + '<span class="tr-item-num">'+(i+1)+'</span>'
          + '<span>'+Utils.escape(x.title||x.name)+'</span>'
          + '<span class="tr-item-rating"><i class="fas fa-star"></i> '+(x.vote_average?x.vote_average.toFixed(1):'N/A')+'</span>'
          + '</div>';
      }).join('');
      document.getElementById('trending-scroll').innerHTML = tickerHtml + tickerHtml;

      /* 3. Trending Now Row */
      document.getElementById('row-trending').innerHTML = tr.results.slice(0,15).map(x => Render.posterCard(x)).join('');

      /* 4. Top 10 Today List */
      document.getElementById('list-top10').innerHTML = tr.results.slice(0,10).map((x,i) => Render.compactCard(x, i+1)).join('');
    }

    /* 5. Top Rated Films */
    if(rtd && rtd.results){
      document.getElementById('grid-toprated').innerHTML = rtd.results.slice(0,6).map(x => Render.landscapeCard(x,'movie')).join('');
    }

    /* 6. TV Series */
    if(tv && tv.results){
      document.getElementById('row-tvshows').innerHTML = tv.results.slice(0,15).map(x => Render.posterCard(x,'tv')).join('');
    }

    /* 7. New Releases */
    if(up && up.results){
      document.getElementById('row-newreleases').innerHTML = up.results.slice(0,15).map(x => Render.posterCard(x,'movie')).join('');
    }

    Prog.done();
  }).catch(err => {
    console.error('Initialization error:', err);
    Prog.done();
  });

  var urlParams=new URLSearchParams(window.location.search);
  var shareId=urlParams.get('id');
  var shareType=urlParams.get('type');
  if(shareId && (shareType==='movie' || shareType==='tv')){
    window.history.replaceState({},document.title,window.location.pathname);
    Modal.openFull(shareId,shareType);
  }
});
