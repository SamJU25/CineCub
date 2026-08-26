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
    document.documentElement.style.overflow = 'hidden';
  },
  unlockScroll: function() {
    document.body.style.paddingRight = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
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
    { name: 'SERVER 1 (AD-FREE)', icon: 'fa-play-circle',
      movie: function(id, time){ return 'https://vidlink.pro/movie/'+id+'?primaryColor=b55fe6&secondaryColor=1f1b24&iconColor=ffffff&autoplay=false' + (time ? '&startAt=' + time : ''); },
      tv:    function(id,s,e, time){ return 'https://vidlink.pro/tv/'+id+'/'+s+'/'+e+'?primaryColor=b55fe6&secondaryColor=1f1b24&iconColor=ffffff&autoplay=false' + (time ? '&startAt=' + time : ''); } },
    { name: 'SERVER 2 (LIGHT ADS)', icon: 'fa-server',
      movie: function(id){ return 'https://vidsrc.me/embed/movie?tmdb='+id; },
      tv:    function(id,s,e){ return 'https://vidsrc.me/embed/tv?tmdb='+id+'&season='+s+'&episode='+e; } },
    { name: 'SERVER 3 (HIGH QUALITY)', icon: 'fa-film',
      movie: function(id){ return 'https://autoembed.co/movie/tmdb/'+id; },
      tv:    function(id,s,e){ return 'https://autoembed.co/tv/tmdb/'+id+'-'+s+'-'+e; } },
    { name: 'SERVER 4 (SUPEREMBED)', icon: 'fa-bolt',
      movie: function(id){ return 'https://multiembed.mov/?video_id='+id+'&tmdb=1'; },
      tv:    function(id,s,e){ return 'https://multiembed.mov/?video_id='+id+'&tmdb=1&s='+s+'&e='+e; } },
    { name: 'SERVER 5 (CINESRC)', icon: 'fa-star',
      movie: function(id, time){ return 'https://cinesrc.st/embed/movie/'+id+'?color=%23b55fe6&autoplay=false' + (time ? '&t=' + time : ''); },
      tv:    function(id,s,e, time){ return 'https://cinesrc.st/embed/tv/'+id+'?s='+s+'&e='+e+'&color=%23b55fe6&autoplay=false' + (time ? '&t=' + time : ''); } },
    { name: 'SERVER 6 (VIDCORE)', icon: 'fa-server',
      movie: function(id){ return 'https://vidcore.org/embed/movie/'+id; },
      tv:    function(id,s,e){ return 'https://vidcore.org/embed/series/'+id+'/'+s+'/'+e; } },
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
var State = { activePage:'page-home', browseType:'movie', browseCategory:'movie', browseMode:'popular', browsePage:1, isFetching:false, genreId:null, activeId:null, activeType:'movie', activeData:null, activeServer:0, watchlist:[], history:[] };

/* ================================================================
   AD-PASS MONETIZATION SYSTEM
================================================================ */

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
  cache: new Map(),
  fetch: async function(url){
    if (this.cache.has(url)) return await this.cache.get(url);
    var promise = fetch(url, {credentials:'omit'}).then(r => {
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }).catch(err => {
      console.error('TMDB request failed:', err);
      this.cache.delete(url);
      return null;
    });
    if (this.cache.size > 150) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(url, promise);
    return await promise;
  },
  trending: function(type, page){ return API.fetch(API.url('/trending/'+(type||'all')+'/week',{page:page||1})); },
  topRated: function(type, page){ return API.fetch(API.url('/'+(type||'movie')+'/top_rated',{page:page||1})); },
  popular:  function(type, page){ return API.fetch(API.url('/'+(type||'movie')+'/popular',{page:page||1})); },
  upcoming: function(page){ return API.fetch(API.url('/movie/upcoming',{page:page||1})); },
  anime:    function(page){ return API.fetch(API.url('/discover/tv',{page:page||1, with_genres:16, with_original_language:'ja'})); },
  search:   function(q){ return API.fetch(API.url('/search/multi',{query:q,page:1,include_adult:false})); },
  detail:   function(id,type){ return API.fetch(API.url('/'+(type||'movie')+'/'+id,{append_to_response:'credits,videos,similar'})); },
  discover: function(type,params){ 
    if(type === 'tv' && params && params.with_genres) {
      var genreMap = {28:10759, 12:10759, 878:10765, 14:10765, 27:9648, 10749:18, 53:9648};
      var gids = String(params.with_genres).split(',');
      params.with_genres = gids.map(function(id) {
        var gid = parseInt(id);
        return genreMap[gid] ? genreMap[gid] : gid;
      }).join(',');
    }
    return API.fetch(API.url('/discover/'+(type||'movie'),params)); 
  }
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
var CustomSelect = {
  init: function() {
    var x, i, j, l, ll, selElmnt, a, b, c;
    x = document.getElementsByClassName("custom-select");
    l = x.length;
    for (i = 0; i < l; i++) {
      selElmnt = x[i].getElementsByTagName("select")[0];
      if(!selElmnt) continue;
      ll = selElmnt.length;
      
      var oldA = x[i].querySelector('.select-selected');
      if(oldA) oldA.remove();
      var oldB = x[i].querySelector('.select-items');
      if(oldB) oldB.remove();

      a = document.createElement("DIV");
      a.setAttribute("class", "select-selected");
      var activeOpt = selElmnt.options[selElmnt.selectedIndex];
      a.innerHTML = activeOpt ? activeOpt.innerHTML : "";
      x[i].appendChild(a);
      
      b = document.createElement("DIV");
      b.setAttribute("class", "select-items select-hide");
      for (j = 0; j < ll; j++) {
        c = document.createElement("DIV");
        c.innerHTML = selElmnt.options[j].innerHTML;
        c.setAttribute("data-value", selElmnt.options[j].value);
        if (j === selElmnt.selectedIndex) {
          c.setAttribute("class", "same-as-selected");
        }
        c.addEventListener("click", function(e) {
            var y, i, k, s, h, sl, yl;
            s = this.parentNode.parentNode.getElementsByTagName("select")[0];
            sl = s.length;
            h = this.parentNode.previousSibling;
            for (i = 0; i < sl; i++) {
              if (s.options[i].innerHTML == this.innerHTML) {
                s.selectedIndex = i;
                h.innerHTML = this.innerHTML;
                y = this.parentNode.getElementsByClassName("same-as-selected");
                yl = y.length;
                for (k = 0; k < yl; k++) {
                  y[k].removeAttribute("class");
                }
                this.setAttribute("class", "same-as-selected");
                break;
              }
            }
            h.click();
            s.dispatchEvent(new Event('change'));
        });
        b.appendChild(c);
      }
      x[i].appendChild(b);
      a.addEventListener("click", function(e) {
          e.stopPropagation();
          CustomSelect.closeAll(this);
          this.nextSibling.classList.toggle("select-hide");
          this.classList.toggle("select-arrow-active");
      });
    }
    document.addEventListener("click", CustomSelect.closeAll);
  },
  closeAll: function(elmnt) {
    var x, y, i, xl, yl, arrNo = [];
    x = document.getElementsByClassName("select-items");
    y = document.getElementsByClassName("select-selected");
    xl = x.length;
    yl = y.length;
    for (i = 0; i < yl; i++) {
      if (elmnt == y[i]) { arrNo.push(i) } else { y[i].classList.remove("select-arrow-active"); }
    }
    for (i = 0; i < xl; i++) {
      if (arrNo.indexOf(i) === -1) { x[i].classList.add("select-hide"); }
    }
  },
  update: function(id, val) {
    var sel = document.getElementById(id);
    if(!sel) return;
    sel.value = val;
    var wrapper = sel.parentNode;
    var selectedDiv = wrapper.querySelector('.select-selected');
    var itemsDiv = wrapper.querySelector('.select-items');
    if(!selectedDiv || !itemsDiv) return;
    var activeOpt = sel.options[sel.selectedIndex];
    if(activeOpt) selectedDiv.innerHTML = activeOpt.innerHTML;
    var options = itemsDiv.getElementsByTagName('DIV');
    for(var i=0; i<options.length; i++){
      if(options[i].getAttribute('data-value') === String(val)) {
        options[i].setAttribute('class', 'same-as-selected');
      } else {
        options[i].removeAttribute('class');
      }
    }
  }
};
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
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    var nav = document.getElementById(id);
    if(nav) nav.classList.add('active');
    
    var mbbId = id.replace('nav-', 'mbb-');
    document.querySelectorAll('.mbb-btn').forEach(el => el.classList.remove('active'));
    var mbb = document.getElementById(mbbId);
    if(mbb) mbb.classList.add('active');

    Sidebar.close();
    document.getElementById('header-page-title').textContent = title;
    document.getElementById('breadcrumb-current').textContent = title;
  },
  goHome: function(){ this.showPage('page-home'); this.setNav('nav-home','Discover'); },
  setBrowseHeader: function(title, showSort) {
    document.getElementById('browse-title').innerText = title;
    document.getElementById('browse-header').style.display = 'flex';
    document.getElementById('wrap-browse-sort').style.display = showSort ? 'block' : 'none';
    document.getElementById('wrap-browse-genre').style.display = showSort ? 'block' : 'none';
    if(showSort) {
      CustomSelect.update('browse-genre', State.genreId || '');
      CustomSelect.update('browse-sort', State.browseMode);
    }
  },
  changeSort: function(val) {
    State.browseMode = val;
    Browse.load();
  },
  changeGenre: function(val) {
    State.genreId = val ? parseInt(val) : null;
    State.browsePage = 1;
    Browse.load();
  },
  browseMovies: function(){ State.browseCategory='movie'; State.browseType='movie'; State.browseMode='popular'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-movies','Movies'); this.setBrowseHeader('Movies', true); Browse.load(); },
  browseTVShows: function(){ State.browseCategory='tv'; State.browseType='tv'; State.browseMode='popular'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-tv','TV Shows'); this.setBrowseHeader('TV Shows', true); Browse.load(); },
  browseAnime: function(){ State.browseCategory='anime'; State.browseType='tv'; State.browseMode='popular'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-anime','Anime'); this.setBrowseHeader('Anime', true); Browse.load(); },
  browseTrending: function(){ State.browseCategory='all'; State.browseType='all'; State.browseMode='trending'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-trending','Trending'); this.setBrowseHeader('Trending', false); Browse.load(); },
  browseTopRated: function(){ State.browseCategory='all'; State.browseType='movie'; State.browseMode='toprated'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-toprated','Top Rated'); this.setBrowseHeader('Top Rated', false); Browse.load(); },
  browseUpcoming: function(){ State.browseCategory='all'; State.browseType='movie'; State.browseMode='upcoming'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-upcoming','Upcoming'); this.setBrowseHeader('Upcoming', false); Browse.load(); },
  showWatchlist: function(){
    Prog.start();
    document.getElementById('search-input').value='';
    document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
    this.showPage('page-watchlist');
    Watchlist.render();
    document.title = "Watchlist \u2014 StreamHeaven";
    Prog.done();
  },
  showHistory: function(){
    Prog.start();
    document.getElementById('search-input').value='';
    document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
    this.showPage('page-history');
    History.render();
    document.title = "Watch History \u2014 StreamHeaven";
    Prog.done();
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
    if(navigator.share){navigator.share({title:title,text:'Watch '+title+' on StreamHeaven',url:shareUrl}).catch(function(err){if(err&&err.name!=='AbortError')fallback();});}
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
  executeFullSearch: function(q) {
    if(!q || !q.trim()) return;
    this.closeDropdown();
    App.showPage('page-search');
    var titleEl = document.getElementById('search-title');
    if(titleEl) titleEl.innerText = 'Search Results for "'+q+'"';
    var spinner = document.getElementById('search-spinner');
    if(spinner) spinner.classList.remove('hidden');
    var grid = document.getElementById('search-full-grid');
    if(grid) grid.innerHTML = '';
    
    API.search(q).then(data => {
      if(spinner) spinner.classList.add('hidden');
      var r = ((data && data.results) || []).filter(x => x.poster_path && x.media_type!=='person');
      if(grid) {
        if(!r.length) { 
          grid.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">No results found.</div>';
        } else {
          grid.innerHTML = r.map(item => Render.posterCard(item, item.media_type||'movie')).join('');
        }
      }
    });
  },
  focusMobile: function(){
    window.scrollTo({top:0,behavior:'smooth'});
    setTimeout(function() { document.getElementById('search-input').focus(); }, 300);
  }
};

var HomeGenre = {
  type: 'movie',
  genreId: 28,
  init: function() {
    this.renderBtns();
    this.load();
  },
  setType: function(type, el) {
    this.type = type;
    document.querySelectorAll('.bgt-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    this.load();
  },
  setGenre: function(id, el) {
    this.genreId = id;
    document.querySelectorAll('.genre-sq-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    this.load();
  },
  renderBtns: function() {
    var html = CFG.GENRES.map(g => {
      var act = g.id === this.genreId ? 'active' : '';
      return '<div class="genre-sq-btn '+act+'" onclick="HomeGenre.setGenre('+g.id+', this)">'+g.name+'</div>';
    }).join('');
    document.getElementById('home-genre-btns').innerHTML = html;
  },
  load: function() {
    var container = document.getElementById('row-home-genre');
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);width:100%">Loading...</div>';
    
    var fetchType = this.type === 'anime' ? 'tv' : this.type;
    var params = {with_genres: this.genreId, page:1, sort_by:'popularity.desc'};
    
    if (this.type === 'anime') {
      params.with_original_language = 'ja';
      params.with_genres = this.genreId + ',16'; // 16 is Animation
    }

    API.discover(fetchType, params).then(data => {
      if(!data || !data.results || !data.results.length) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);width:100%">No titles found.</div>';
        return;
      }
      container.innerHTML = data.results.map(item => Render.posterCard(item, fetchType)).join('');
    });
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
  next: function(){ 
    if(State.activePage !== 'page-home') return;
    this.goTo((this.current+1) % this.items.length); 
  },
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
    
    var isDown = false, startX, scrollLeft, isDragging = false;
    el.addEventListener('mousedown', function(e){
      isDown = true;
      isDragging = false;
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
      if (Math.abs(walk) > 5) isDragging = true;
      el.scrollLeft = scrollLeft - walk;
    });
    el.addEventListener('click', function(e){
      if(isDragging) { e.preventDefault(); e.stopPropagation(); }
    }, true);
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
    var rating = item.vote_average ? item.vote_average.toFixed(1) : '';
    var ratingHtml = rating ? '<span class="pc-rating"><i class="fas fa-star"></i>'+rating+'</span>' : '';
    var year = Utils.year(item.release_date||item.first_air_date);
    var yearHtml = year && year !== 'N/A' ? '<span>'+year+'</span>' : '';
    var genre = Utils.genreNames(item.genre_ids);
    var genreHtml = genre !== 'General' ? '<span class="pc-genre">'+Utils.escape(genre.split(',')[0])+'</span>' : '';
    var isNew = item.release_date && (new Date(item.release_date) > new Date(Date.now()-60*24*60*60*1000));
    var badge = isNew ? '<span class="pc-badge pc-badge-new">NEW</span>' : (mType==='tv' ? '<span class="pc-badge pc-badge-quality">SERIES</span>' : '');
    var inWl = State.watchlist.some(function(w){return w.id===item.id;});
    var wlClass = inWl?'in-list':''; var wlIcon=inWl?'fa-check':'fa-heart';
    return '<div class="poster-card" onclick="Modal.openFull('+item.id+', '+Utils.jsAttr(mType)+')">'
      + '<div class="poster-card-img-wrap">'
      + '<img class="poster-card-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'"/>'
      + '<div class="poster-card-grad"></div>'
      + '<div class="poster-card-top">'+badge+ratingHtml+'</div>'
      + '<div class="pc-play-wrap"><div class="pc-play-btn"><i class="fas fa-play"></i></div></div>'
      + '<div class="pc-wl-btn wl-btn-'+item.id+' '+wlClass+'" title="'+(inWl?'Remove from watchlist':'Add to watchlist')+'" onclick="Watchlist.toggleById(event,'+item.id+','+Utils.jsAttr(mType)+','+Utils.jsAttr(title)+','+Utils.jsAttr(item.poster_path||'')+','+Number(item.vote_average||0)+','+Utils.jsAttr(item.release_date||item.first_air_date||'')+')"><i class="fas '+wlIcon+'"></i></div>'
      + '</div>'
      + '<div class="poster-card-info"><div class="pc-title" title="'+Utils.escape(title)+'">'+Utils.escape(title)+'</div><div class="pc-meta">'+yearHtml+genreHtml+(item.season?' <span class="pc-genre">S'+item.season+(item.episode?' E'+item.episode:'')+'</span>':'')+'</div></div>'
      + '</div>';
  },
  landscapeCard: function(item, type){
    if(!item) return '';
    var mType=type||'movie'; var title=item.title||item.name||'Untitled';
    var img=item.backdrop_path?CFG.IMG500+item.backdrop_path:(item.poster_path?CFG.IMG342+item.poster_path:Utils.placeholder());
    var rating=item.vote_average?item.vote_average.toFixed(1):''; 
    var ratingHtml = rating ? '<span class="pc-rating"><i class="fas fa-star"></i>'+rating+'</span>' : '';
    var genre=Utils.genreNames(item.genre_ids);
    var genreHtml = genre !== 'General' ? Utils.escape(genre) : '';
    var inWl=State.watchlist.some(function(w){return w.id===item.id;}); var wlClass=inWl?'in-list':''; var wlIcon=inWl?'fa-check':'fa-heart';
    var year = Utils.year(item.release_date||item.first_air_date);
    var yearHtml = year && year !== 'N/A' ? Utils.escape(year)+(genreHtml?' &middot; ':'') : '';
    return '<div class="landscape-card" onclick="Modal.openFull('+item.id+', '+Utils.jsAttr(mType)+')">'
      + '<div class="lc-img-wrap"><img class="lc-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'"/><div class="lc-overlay"></div>'
      + '<div class="lc-top"><span class="pc-badge pc-badge-quality">'+(mType==='tv'?'SERIES':'MOVIE')+'</span>'+ratingHtml+'</div>'
      + '<div class="pc-play-wrap"><div class="pc-play-btn"><i class="fas fa-play"></i></div></div>'
      + '<div class="pc-wl-btn wl-btn-'+item.id+' '+wlClass+'" title="'+(inWl?'Remove from watchlist':'Add to watchlist')+'" onclick="Watchlist.toggleById(event,'+item.id+','+Utils.jsAttr(mType)+','+Utils.jsAttr(title)+','+Utils.jsAttr(item.poster_path||'')+','+Number(item.vote_average||0)+','+Utils.jsAttr(item.release_date||item.first_air_date||'')+')"><i class="fas '+wlIcon+'"></i></div>'
      + '</div>'
      + '<div class="lc-info"><div class="lc-title">'+Utils.escape(title)+'</div><div class="lc-meta">'+yearHtml+genreHtml+'</div></div>'
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
  load: function(append){
    if(State.isFetching) return;
    State.isFetching = true;
    if(!append) { State.browsePage = 1; Prog.start(); Render.skeletons('browse-grid', 18); }
    var p;
    if(State.browseCategory === 'anime') {
        var genreParam = State.genreId ? '16,'+State.genreId : 16;
        if(State.browseMode === 'popular' || State.browseMode === 'trending') p = API.discover('tv', {page:State.browsePage, with_genres:genreParam, with_original_language:'ja', sort_by:'popularity.desc'});
        else if(State.browseMode === 'toprated') p = API.discover('tv', {page:State.browsePage, with_genres:genreParam, with_original_language:'ja', sort_by:'vote_average.desc', 'vote_count.gte':200});
        else if(State.browseMode === 'newest') p = API.discover('tv', {page:State.browsePage, with_genres:genreParam, with_original_language:'ja', sort_by:'first_air_date.desc'});
    } else if(State.browseCategory === 'movie' || State.browseCategory === 'tv') {
        var sortParam = 'popularity.desc';
        if(State.browseMode === 'trending') sortParam = 'popularity.desc';
        else if(State.browseMode === 'toprated') sortParam = 'vote_average.desc';
        else if(State.browseMode === 'newest') sortParam = State.browseType==='movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
        
        if(State.genreId) {
            var params = {page:State.browsePage, sort_by:sortParam, with_genres:State.genreId};
            if(State.browseMode === 'toprated') params['vote_count.gte'] = 200;
            p = API.discover(State.browseType, params);
        } else {
            if(State.browseMode === 'popular') p = API.popular(State.browseType, State.browsePage);
            else if(State.browseMode === 'trending') p = API.trending(State.browseType, State.browsePage);
            else if(State.browseMode === 'toprated') p = API.topRated(State.browseType, State.browsePage);
            else if(State.browseMode === 'newest') p = API.discover(State.browseType, {page:State.browsePage, sort_by: sortParam});
        }
    } else {
        // Fallback for global buttons (Trending, Top Rated, Upcoming)
        if(State.browseMode==='trending') p = API.trending(State.browseType, State.browsePage);
        else if(State.browseMode==='toprated') p = API.topRated(State.browseType==='all'?'movie':State.browseType, State.browsePage);
        else if(State.browseMode==='upcoming') p = API.upcoming(State.browsePage);
        else p = API.popular(State.browseType==='all'?'movie':State.browseType, State.browsePage);
    }

    p.then(function(data){
      State.isFetching = false;
      if(data && data.results){
        var items=data.results.filter(function(x){return x.poster_path;});
        if (items.length === 0) State.hasMore = false;
        var html = items.map(function(x){return Render.posterCard(x, State.browseType==='all'?null:State.browseType);}).join('');
        if(!html && !append) html = '<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">No titles found.</div>';
        if(append) document.getElementById('browse-grid').insertAdjacentHTML('beforeend', html);
        else document.getElementById('browse-grid').innerHTML = html;
      }else if(!append){
        document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load titles right now. Please try again.</div>';
      }
      if(!append) { Prog.done(); initDragScroll(); }
    }).catch(function(){
      State.isFetching = false;
      if(!append) { document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load titles right now. Please try again.</div>'; Prog.done(); }
    });
  },
  byGenre: function(genreId, name, append){
    if(State.isFetching) return;
    State.isFetching = true;
    State.browseType = 'movie';
    State.browseMode = 'genre';
    State.genreId = genreId;
    if(!append) { State.browsePage = 1; App.showPage('page-browse'); App.setNav('nav-movies', name); Prog.start(); Render.skeletons('browse-grid', 18); }
    
    var params = {with_genres: genreId, page: State.browsePage};
    
    API.discover(State.browseType, params).then(function(data){
      State.isFetching = false;
      if(data && data.results){
        var items=data.results.filter(function(x){return x.poster_path;});
        if (items.length === 0) State.hasMore = false;
        var html = items.map(function(x){return Render.posterCard(x,State.browseType);}).join('');
        if(!html && !append) html = '<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">No titles found.</div>';
        if(append) document.getElementById('browse-grid').insertAdjacentHTML('beforeend', html);
        else document.getElementById('browse-grid').innerHTML = html;
      }else if(!append){
        document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load this genre right now.</div>';
      }
      if(!append) { Prog.done(); initDragScroll(); }
    }).catch(function(){
      State.isFetching = false;
      if(!append) { document.getElementById('browse-grid').innerHTML='<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;">Unable to load this genre right now.</div>'; Prog.done(); }
    });
  }
};

/* ================================================================
   07. MODAL & EMBEDDED STREAMING
================================================================ */
var Modal = {
  isOpening: false, 
  overlayClick: function(e){ if(e.target === document.getElementById('modal-overlay')) this.closeAll(); },
  closeAll: function(skipHistory){
    document.getElementById('modal-overlay').classList.remove('open');
    
    var tp = document.getElementById('trailer-player');
    if (tp) {
      tp.src = 'about:blank';
      var cloneTp = tp.cloneNode(true);
      cloneTp.removeAttribute('src');
      tp.parentNode.replaceChild(cloneTp, tp);
    }
    
    var toast = document.getElementById('up-next-toast');
    if (toast) toast.classList.add('hidden');
    
    UIHelper.unlockScroll();
    document.title = "StreamHeaven \u2014 Watch Movies & TV Series";
    
    var iframe = document.getElementById('main-player');
    if (iframe) {
      iframe.src = 'about:blank';
      var cloneMain = iframe.cloneNode(true);
      cloneMain.removeAttribute('src');
      cloneMain.classList.remove('loaded');
      iframe.parentNode.replaceChild(cloneMain, iframe);
    }
    
    if (!skipHistory && window.location.hash === '#media') {
      window.history.back();
    }
  },
  openFull: function(id, type){
    if (this.isOpening) return; 
    this.isOpening = true;
    Search.closeDropdown();
    
    if (window.location.hash !== '#media') {
      window.history.pushState({modal: true}, '', '#media');
    }
    
    State.activeId = id; State.activeType = type;
    Prog.start();
    API.detail(id, type).then(data => {
      this.isOpening = false; 
      if(!data){ Toast.show('Error loading details.'); Prog.done(); return; }
      State.activeData = data;
      document.getElementById('fv-backdrop').src = CFG.ORIG+(data.backdrop_path||data.poster_path);
      document.getElementById('fv-poster').src = CFG.IMG342+data.poster_path;
      document.getElementById('fv-title').textContent = data.title||data.name;
      document.title = "Watching " + (data.title||data.name) + " \u2014 StreamHeaven";
      document.getElementById('fv-year').textContent = Utils.year(data.release_date||data.first_air_date);
      document.getElementById('fv-rating').textContent = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
      document.getElementById('fv-desc').textContent = data.overview;
      document.getElementById('fv-genre').textContent = (data.genres||[]).map(x=>x.name).join(', ');
      document.getElementById('fv-runtime').textContent = type==='movie'?Utils.runtime(data.runtime):((data.number_of_seasons||1)+' Season(s)');
      
      var cast = ((data.credits&&data.credits.cast)||[]).slice(0,10);
      document.getElementById('fv-cast').innerHTML = cast.map(c => '<div class="cast-card"><img class="cast-avatar" src="'+(c.profile_path?CFG.IMG185+c.profile_path:Utils.placeholder())+'"/><div class="cast-name">'+Utils.escape(c.name)+'</div><div class="cast-char">'+Utils.escape(c.character||'')+'</div></div>').join('');
      
      var similar = ((data.similar&&data.similar.results)||[]).filter(x => x.poster_path);
      if(similar.length) {
        document.getElementById('fv-similar').innerHTML = similar.map(item => Render.posterCard(item, item.media_type || type)).join('');
      } else {
        document.getElementById('fv-similar').innerHTML = '<div style="color:var(--text-3); font-size:14px; text-align:center; padding: 20px; width:100%; grid-column:1/-1;">No similar titles found.</div>';
      }
      
      var epRow = document.getElementById('ep-row');
      if(type==='tv'){
        epRow.className = 'ep-row';
        var validSeasons = (data.seasons || []).filter(function(s) { return s.season_number >= 0; });
        if (validSeasons.length === 0) {
          var maxS = data.number_of_seasons || 1;
          validSeasons = Array.from({length: maxS}, function(_,i) { return {season_number: i+1, episode_count: 24}; });
        }
        
        document.getElementById('ep-season').innerHTML = validSeasons.map(function(s) {
           var label = s.season_number === 0 ? 'Specials' : 'Season ' + s.season_number;
           return '<option value="'+s.season_number+'">'+label+'</option>';
        }).join('');
        
        var hist = State.history.find(function(h){return h.id===id && h.type==='tv';});
        if(hist && hist.season !== null && hist.season !== undefined) {
          document.getElementById('ep-season').value = hist.season;
        }
        
        Player.updateEpisodes();
        
        if(hist && hist.episode !== null && hist.episode !== undefined) {
          var maxEp = document.getElementById('ep-episode').options.length;
          document.getElementById('ep-episode').value = Math.min(hist.episode, maxEp);
        }
        
        document.getElementById('ep-btn-next').classList.remove('hidden');
        document.getElementById('ep-btn-prev').classList.remove('hidden');
      } else { 
        epRow.className = 'ep-row hidden';
        document.getElementById('ep-btn-next').classList.add('hidden');
        document.getElementById('ep-btn-prev').classList.add('hidden');
      }

      document.getElementById('server-tabs').innerHTML = CFG.SERVERS.map((s,i) => '<div class="server-tab '+(i===0?'active':'')+'" onclick="Player.switchServer('+i+', this)"><i class="fas '+s.icon+'"></i> '+s.name+'</div>').join('');
      State.activeServer = 0;

      var trailerTab = document.getElementById('fv-tab-trailer');
      State.activeTrailer = null;
      if (data.videos && data.videos.results) {
        var trailer = data.videos.results.find(function(v){return v.site==='YouTube' && v.type==='Trailer';});
        if (!trailer) trailer = data.videos.results.find(function(v){return v.site==='YouTube';});
        if (trailer) State.activeTrailer = trailer.key;
      }
      if (trailerTab) {
        if (State.activeTrailer) trailerTab.classList.remove('hidden');
        else trailerTab.classList.add('hidden');
      }

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
  updateEpisodes: function() {
    if (State.activeType !== 'tv' || !State.activeData || !State.activeData.seasons) return;
    var sSelect = document.getElementById('ep-season');
    var eSelect = document.getElementById('ep-episode');
    var sNumber = Number(sSelect.value || 1);
    
    var season = State.activeData.seasons.find(function(s) { return s.season_number === sNumber; });
    var count = season ? season.episode_count : 24; 
    if (count === 0) count = 1;
    
    var currentEp = Number(eSelect.value || 1);
    eSelect.innerHTML = Array.from({length: count}, function(_,i) { 
      return '<option value="'+(i+1)+'">Episode '+(i+1)+'</option>'; 
    }).join('');
    
    if (currentEp <= count) eSelect.value = currentEp;
  },
  nextEpisode: function(){
    if(State.activeType !== 'tv') return;
    var sSelect = document.getElementById('ep-season');
    var eSelect = document.getElementById('ep-episode');
    var s = Number(sSelect.value || 1);
    var e = Number(eSelect.value || 1);
    var maxEpisodes = eSelect.options.length;
    
    if(e >= maxEpisodes) {
      if (sSelect.options.selectedIndex < sSelect.options.length - 1) {
         sSelect.selectedIndex += 1;
         this.updateEpisodes();
         eSelect.value = 1;
      } else {
         Toast.show('You have reached the final episode!', 'info');
         return;
      }
    } else {
      eSelect.value = e + 1;
    }
    this.loadVideo();
  },
  prevEpisode: function(){
    if(State.activeType !== 'tv') return;
    var sSelect = document.getElementById('ep-season');
    var eSelect = document.getElementById('ep-episode');
    var s = Number(sSelect.value || 1);
    var e = Number(eSelect.value || 1);
    
    if(e <= 1) {
      if (sSelect.options.selectedIndex > 0) {
        sSelect.selectedIndex -= 1;
        this.updateEpisodes();
        eSelect.value = eSelect.options.length;
      } else {
        Toast.show('You are at the very first episode!', 'info');
        return;
      }
    } else {
      eSelect.value = e - 1;
    }
    this.loadVideo();
  },
  loadVideo: function(){
    var iframe = document.getElementById('main-player');
    iframe.style.display = 'block';
    
    // Removed sandbox completely because most providers actively detect and block it
    iframe.removeAttribute('sandbox');

    var s=CFG.SERVERS[State.activeServer], url, season=null, episode=null, savedTime=0;
    
    try {
      var vlData = JSON.parse(localStorage.getItem('vidLinkProgress') || '{}');
      var itemData = vlData[State.activeId];
      if (itemData) {
        if (State.activeType === 'tv' && itemData.show_progress) {
          season=Number(document.getElementById('ep-season').value||1);
          episode=Number(document.getElementById('ep-episode').value||1);
          var epKey = 's' + season + 'e' + episode;
          if (itemData.show_progress[epKey] && itemData.show_progress[epKey].progress) {
            savedTime = itemData.show_progress[epKey].progress.watched;
            var dur = itemData.show_progress[epKey].progress.duration;
            if (dur > 0 && savedTime > dur - 60) savedTime = 0;
          }
        } else if (State.activeType === 'movie' && itemData.progress) {
          savedTime = itemData.progress.watched;
          var dur = itemData.progress.duration;
          if (dur > 0 && savedTime > dur - 60) savedTime = 0;
        }
      }
    } catch(e) {}

    if(State.activeType==='tv'){
      season=Number(document.getElementById('ep-season').value||1);
      episode=Number(document.getElementById('ep-episode').value||1);
      url=s.tv(State.activeId,season,episode, savedTime ? Math.floor(savedTime) : 0);
    }else{ 
      url=s.movie(State.activeId, savedTime ? Math.floor(savedTime) : 0); 
    }
    
    iframe.classList.remove('loaded');
    iframe.onload = function() { 
      iframe.classList.add('loaded'); 
    }; 
    iframe.src = url;
    
    if(State.activeData) History.add(State.activeId,State.activeType,State.activeData.title||State.activeData.name,State.activeData.poster_path,season,episode,State.activeData.vote_average,State.activeData.release_date||State.activeData.first_air_date);
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
    
    if(t==='trailer' && State.activeTrailer) {
       document.getElementById('trailer-player').src = 'https://www.youtube.com/embed/' + State.activeTrailer + '?autoplay=1';
    } else {
       var tp = document.getElementById('trailer-player');
       if(tp) tp.src = '';
    }
  }
};

var Watchlist = {
  toggleCurrent: function(e){
    if(e) e.stopPropagation();
    var d=State.activeData;if(!State.activeId||!d)return;
    this.toggleById(e,State.activeId,State.activeType,d.title||d.name,d.poster_path,d.vote_average,d.release_date||d.first_air_date);
  },
  toggleById: function(e,id,type,title,poster,vote,date){
    if(e) e.stopPropagation();
    var idx=State.watchlist.findIndex(function(x){return x.id===id;});
    var added=false;
    if(idx===-1){State.watchlist.unshift({id:id,type:type,title:title,poster_path:poster,vote_average:vote,release_date:date});added=true;Toast.show('Added to watchlist','success');}
    else{State.watchlist.splice(idx,1);Toast.show('Removed from watchlist','info');}
    Library.saveUserData();
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
  add: function(id,type,title,poster,season,episode,vote,date){
    var s = (season !== undefined && season !== null) ? season : null;
    var e = (episode !== undefined && episode !== null) ? episode : null;
    var idx=State.history.findIndex(function(x){return x.id===id;});
    if(idx>-1)State.history.splice(idx,1);
    State.history.unshift({id:id,type:type,title:title,poster_path:poster,season:s,episode:e,vote_average:vote,release_date:date,watchedAt:new Date().toISOString()});
    while(State.history.length>50)State.history.pop();
    Library.saveUserData();
  },
  render: function(){var el=document.getElementById('history-grid');if(!el)return;el.innerHTML=State.history.map(function(x){return Render.posterCard(x,x.type);}).join('')||'<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">Your watch history is empty.</div>';},
  clearAll: function(){if(!State.history.length){Toast.show('Watch history is already empty.','info');return;}State.history=[];Library.saveUserData();this.render();Toast.show('History cleared successfully.','success');}
};


/* ================================================================
   08. LEGAL & POLICY MODAL 
================================================================ */
var Legal = {
  content: {
    dmca: { title: 'DMCA Copyright Policy', html: '<p>StreamHeaven respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act (DMCA), we will respond expeditiously to claims of copyright infringement committed using our service.</p><h3>Reporting Copyright Infringement</h3><p>StreamHeaven does not host any media files on its servers. All contents are provided by non-affiliated third parties. If you believe that your copyrighted work is accessible on StreamHeaven without authorization, please submit a DMCA notice including:</p><p>&bull; Identification of the copyrighted work claimed to have been infringed.<br>&bull; The exact URL or location on our site where the material is located.<br>&bull; Your contact information (Name, Email, Phone Number).<br>&bull; A statement of good faith belief that the disputed use is not authorized by the copyright owner.</p><p>Contact our DMCA agent at: <strong>streamheaven.support@gmail.com</strong></p>' },
    privacy: { title: 'Privacy Policy', html: '<p>Your privacy is important to StreamHeaven. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website or application.</p><h3>1. Information We Store</h3><p>We use your browser\'s local storage (`localStorage`) solely to save your local user session, customized watchlist, and watch history so you can pick up right where you left off. We do not sell or share any of this personal preference data with third parties.</p><h3>2. Third-Party Services</h3><p>We utilize the TMDB API for movie and TV show metadata and imagery. Third-party video embedding providers may use cookies or standard web trackers to deliver media streams.</p>' },
    terms: { title: 'Terms of Service', html: '<p>Welcome to StreamHeaven. By accessing or using our website and application, you agree to be bound by these Terms of Service.</p><h3>1. Acceptance of Terms</h3><p>You must be at least 13 years of age to use this platform. By using StreamHeaven, you warrant that you meet this age requirement.</p><h3>2. Third-Party Content Disclaimer</h3><p>StreamHeaven does not host, upload, or stream any video files on its servers. All videos and media content are hosted by external third-party services. We assume no responsibility or liability for the content hosted on third-party servers.</p>' },
    contact: { title: 'Contact Us', html: '<p>Have questions, feedback, or partnership inquiries? We would love to hear from you!</p><h3>Get in Touch</h3><p>You can reach our support team directly via email:<br><br><strong style="font-size:16px; color:var(--cv-purple-light);"><i class="fas fa-envelope"></i> streamheaven.support@gmail.com</strong></p><p>We typically respond to inquiries within 24 to 48 hours.</p>' }
  },
  open: function(type) {
    var data = this.content[type];
    if(!data) return;
    
    if(typeof Sidebar !== 'undefined' && Sidebar.close) Sidebar.close();
    if(typeof Modal !== 'undefined' && Modal.closeAll) Modal.closeAll();
    if(typeof Auth !== 'undefined' && Library.closeProfile) Library.closeProfile();

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
   09. LIBRARY / PROFILE
================================================================ */
var Library = (function(){
  var WATCH_KEY = 'sh_watchlist', HISTORY_KEY = 'sh_history';

  function loadUserData(){
    try{State.watchlist=JSON.parse(localStorage.getItem(WATCH_KEY)||'[]');State.history=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}
    catch(e){State.watchlist=[];State.history=[];}
  }

  function saveUserData(){
    try{localStorage.setItem(WATCH_KEY,JSON.stringify(State.watchlist));localStorage.setItem(HISTORY_KEY,JSON.stringify(State.history));}
    catch(e){console.error('Unable to save guest media data:',e);}
  }

  function toggleProfile(e){
    if(e && e.preventDefault) e.preventDefault();
    if(e && e.stopPropagation) e.stopPropagation();
    var popup = document.getElementById('profile-popup');
    if(!popup) return;
    var willOpen = !popup.classList.contains('open');
    closeProfile();
    if(willOpen) popup.classList.add('open');
  }

  function closeProfile(){
    var popup = document.getElementById('profile-popup');
    if(popup) popup.classList.remove('open');
  }

  function init(){
    loadUserData();
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape') closeProfile();
    });
    document.addEventListener('click', function(e){
      var popup = document.getElementById('profile-popup');
      if(!popup) return;
      if(popup.contains(e.target)) return;
      if(e.target.closest('.nav-btn')) return;
      popup.classList.remove('open');
    });
  }

  return {
    init:init, toggleProfile:toggleProfile, closeProfile:closeProfile, saveUserData:saveUserData
  };
})();


/* ================================================================
   10. INITIALIZATION
================================================================ */
document.addEventListener('DOMContentLoaded', function(){
  Prog.init();
  Library.init();
  initDragScroll();

  /* Init By Genre Section */
  HomeGenre.init();

  /* Populate Genre Select */
  var genreSelect = document.getElementById('browse-genre');
  if(genreSelect) {
    CFG.GENRES.forEach(function(g){
      var opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      genreSelect.appendChild(opt);
    });
  }

  document.addEventListener('click', function(e){
    if(!e.target.closest('#search-container')) {
      Search.closeDropdown();
    }
  });

  CustomSelect.init();

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

  // Infinite Scroll Observer
  var sentinel = document.getElementById('infinite-scroll-trigger');
  if(sentinel && window.IntersectionObserver) {
    var observer = new IntersectionObserver(function(entries){
      if(entries[0].isIntersecting && State.activePage === 'page-browse' && !State.isFetching && State.hasMore !== false) {
        State.browsePage++;
        if(State.browseMode === 'genre') Browse.byGenre(State.genreId, document.getElementById('header-page-title').textContent, true);
        else Browse.load(true);
      }
    }, {rootMargin: '200px'});
    observer.observe(sentinel);
  }

  // Back to Top Button Logic
  window.addEventListener('scroll', function() {
    var btn = document.getElementById('back-to-top');
    if (btn) {
      if (window.scrollY > 800) btn.classList.add('visible');
      else btn.classList.remove('visible');
    }
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (document.getElementById('modal-overlay').classList.contains('open')) {
        Modal.closeAll();
      } else if (document.getElementById('profile-popup') && document.getElementById('profile-popup').classList.contains('open')) {
        Library.closeProfile();
      }
    }
  });

  // Prevent Background Scroll when hovering outside modal box
  var overlay = document.getElementById('modal-overlay');
  if (overlay) {
    function preventScroll(e) {
      if (e.target === overlay) e.preventDefault();
    }
    overlay.addEventListener('wheel', preventScroll, {passive: false});
    overlay.addEventListener('touchmove', preventScroll, {passive: false});
  }

  // Mobile Back Button Support
  window.addEventListener('hashchange', function() {
    if (window.location.hash !== '#media' && document.getElementById('modal-overlay').classList.contains('open')) {
      Modal.closeAll(true);
    }
  });

  // Anti-Redirect / Ad-Blocker Fallback
  window.addEventListener('beforeunload', function (e) {
    if (document.getElementById('modal-overlay').classList.contains('open')) {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave the stream?';
      return e.returnValue;
    }
  });
});

window.addEventListener('message', (event) => {
  if (event.origin !== 'https://vidlink.pro') return;

  if (event.data?.type === 'MEDIA_DATA') {
    const mediaData = event.data.data;
    if (State.activeId) {
      let vlData = {};
      try { vlData = JSON.parse(localStorage.getItem('vidLinkProgress') || '{}'); } catch(e){}
      vlData[State.activeId] = mediaData;
      localStorage.setItem('vidLinkProgress', JSON.stringify(vlData));
    }
  }

  if (event.data?.type === 'PLAYER_EVENT') {
    const { event: eventType, currentTime, duration } = event.data.data;
    
    if (eventType === 'timeupdate' && State.activeType === 'tv') {
      var timeLeft = duration - currentTime;
      var toast = document.getElementById('up-next-toast');
      
      var sSelect = document.getElementById('ep-season');
      var eSelect = document.getElementById('ep-episode');
      var isLastEpisode = false;
      if (sSelect && eSelect) {
         var maxEp = eSelect.options.length;
         if (Number(eSelect.value) >= maxEp && sSelect.options.selectedIndex >= sSelect.options.length - 1) {
           isLastEpisode = true;
         }
      }
      
      if (!isLastEpisode && timeLeft > 0 && timeLeft <= 15) {
        if(toast) {
          toast.classList.remove('hidden');
          document.getElementById('up-next-time').innerText = Math.floor(timeLeft);
        }
        if (Math.floor(timeLeft) === 0) {
           if (!State.isAutoplaying) {
             State.isAutoplaying = true;
             Player.nextEpisode();
             if(toast) toast.classList.add('hidden');
             setTimeout(() => { State.isAutoplaying = false; }, 5000);
           }
        }
      } else {
        if(toast) toast.classList.add('hidden');
      }
    }
  }
});
