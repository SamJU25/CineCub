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
    { name: 'SERVER 1 (VIDLINK)', icon: 'fa-play-circle',
      movie: function(id, time){ return 'https://vidlink.pro/movie/'+id+'?primaryColor=b55fe6&secondaryColor=1f1b24&iconColor=ffffff&autoplay=false' + (time ? '&startAt=' + time : ''); },
      tv:    function(id,s,e, time){ return 'https://vidlink.pro/tv/'+id+'/'+s+'/'+e+'?primaryColor=b55fe6&secondaryColor=1f1b24&iconColor=ffffff&autoplay=false' + (time ? '&startAt=' + time : ''); } },
    { name: 'SERVER 2 (VIDSRC)', icon: 'fa-server',
      movie: function(id){ return 'https://vidsrc.me/embed/movie?tmdb='+id; },
      tv:    function(id,s,e){ return 'https://vidsrc.me/embed/tv?tmdb='+id+'&season='+s+'&episode='+e; } },
    { name: 'SERVER 3 (AUTOEMBED)', icon: 'fa-film',
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
  skeletonHtml: function(count, isHScroll) {
    var style = isHScroll ? 'style="flex: 0 0 auto; width: 150px; height: 225px; margin-right: 12px;"' : 'style="width: 100%; aspect-ratio: 2/3;"';
    var html = '';
    for(var i=0; i<count; i++){
      html += '<div class="skeleton-card" ' + style + '></div>';
    }
    return isHScroll ? html : '<div class="poster-grid" style="width:100%; margin-top:20px;">' + html + '</div>';
  },
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
    
    try {
      var sessData = sessionStorage.getItem('tmdb_' + url);
      if (sessData) {
        var parsed = JSON.parse(sessData);
        if (parsed) {
           var p = Promise.resolve(parsed);
           this.cache.set(url, p);
           return p;
        }
      }
    } catch(e) {}
    
    var promise = fetch(url, {credentials:'omit'}).then(r => {
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }).then(data => {
      try { sessionStorage.setItem('tmdb_' + url, JSON.stringify(data)); } catch(e) {}
      return data;
    }).catch(err => {
      console.error('TMDB request failed:', err);
      if(typeof Toast !== 'undefined') Toast.show('Error fetching data. Please try again.', 'error');
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
  search:   function(q, page){ return API.fetch(API.url('/search/multi',{query:q,page:page||1,include_adult:false})); },
  detail:   function(id,type){ 
    if(type==='person') return API.fetch(API.url('/person/'+id,{append_to_response:'combined_credits'}));
    return API.fetch(API.url('/'+(type||'movie')+'/'+id,{append_to_response:'credits,videos,similar'})); 
  },
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
  open: function(){ document.body.classList.add('no-scroll'); document.getElementById('cv-sidebar').classList.add('mobile-open'); document.getElementById('sidebar-overlay').classList.add('open'); },
  close: function(){ document.body.classList.remove('no-scroll'); document.getElementById('cv-sidebar').classList.remove('mobile-open'); document.getElementById('sidebar-overlay').classList.remove('open'); }
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
  browseTVShows: function(){ State.browseCategory='tv'; State.browseType='tv'; State.browseMode='popular'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-tv','TV Series'); this.setBrowseHeader('TV Series', true); Browse.load(); },
  browseAnime: function(){ State.browseCategory='anime'; State.browseType='tv'; State.browseMode='popular'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-anime','Anime'); this.setBrowseHeader('Anime', true); Browse.load(); },
  browseTrending: function(){ State.browseCategory='all'; State.browseType='all'; State.browseMode='trending'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-trending','Trending'); this.setBrowseHeader('Trending', false); Browse.load(); },
  browseTopRated: function(){ State.browseCategory='all'; State.browseType='movie'; State.browseMode='toprated'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-toprated','Top Rated'); this.setBrowseHeader('Top Rated', false); Browse.load(); },
  browseUpcoming: function(){ State.browseCategory='all'; State.browseType='movie'; State.browseMode='upcoming'; State.browsePage=1; State.genreId=null; this.showPage('page-browse'); this.setNav('nav-upcoming','Upcoming'); this.setBrowseHeader('Upcoming', false); Browse.load(); },
  updateWatchlistButtons: function() {
    document.querySelectorAll('[class*="wl-btn-"]').forEach(function(btn) {
      var match = btn.className.match(/wl-btn-(\d+)/);
      if (match && match[1]) {
        var id = parseInt(match[1]);
        var inWl = State.watchlist.some(function(w){return w.id===id;});
        var icon = btn.querySelector('i');
        btn.classList.toggle('in-list', inWl);
        btn.setAttribute('title', inWl ? 'Remove from watchlist' : 'Add to watchlist');
        if(icon) {
          icon.classList.toggle('fa-check', inWl);
          icon.classList.toggle('fa-heart', !inWl);
        }
      }
    });
    var fv = document.getElementById('fv-wl-btn');
    if(fv && State.activeId) {
      var inWl = State.watchlist.some(function(w){return w.id===State.activeId;});
      fv.classList.toggle('active-wl', inWl);
      fv.setAttribute('title', inWl ? 'Remove from watchlist' : 'Add to watchlist');
      var fi = fv.querySelector('i');
      if(fi) {
        fi.classList.toggle('fa-check', inWl);
        fi.classList.toggle('fa-heart', !inWl);
      }
    }
  },
  showWatchlist: function(){
    Prog.start();
    document.getElementById('search-input').value='';
    this.showPage('page-watchlist');
    this.setNav('nav-watchlist', 'Watchlist');
    Watchlist.render();
    document.title = "Watchlist \u2014 StreamHeaven";
    Prog.done();
  },
  showHistory: function(){
    Prog.start();
    document.getElementById('search-input').value='';
    this.showPage('page-history');
    this.setNav('nav-history', 'Watch History');
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
  dropdownQuery: '',
  dropdownPage: 1,
  dropdownHasMore: false,
  isDropdownFetching: false,
  dropdownObserver: null,
  onInput: function(q){
    clearTimeout(this.timer);
    var d = document.getElementById('search-dropdown');
    if(!q || !q.trim()){ d.classList.remove('open'); return; }
    d.classList.add('open');
    this.dropdownQuery = q;
    this.dropdownPage = 1;
    this.dropdownHasMore = true;
    document.getElementById('srd-results').innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-3);">Searching TMDB...</div>';
    this.timer = setTimeout(()=>{ this.doSearch(q); }, 400);
  },
  doSearch: function(q){
    if(this.isDropdownFetching) return;
    this.isDropdownFetching = true;
    API.search(q, 1).then(data => {
      this.isDropdownFetching = false;
      var r = ((data && data.results) || []).filter(x => x.poster_path && x.media_type!=='person');
      
      var container = document.getElementById('srd-results');
      if(!r.length){ 
        container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-3);">No results found.</div>'; 
        return; 
      }
      
      var html = r.slice(0, 8).map(item => {
        var t = item.media_type||'movie';
        return '<div class="srd-item" onclick="document.getElementById(\'search-input\').blur(); Modal.openFull('+item.id+',\''+t+'\')">'
          + '<img class="srd-poster" src="'+CFG.IMG185+item.poster_path+'" loading="lazy" decoding="async" alt="'+Utils.escape(item.title||item.name)+'" onerror="this.src=Utils.placeholder()"/>'
          + '<div class="srd-info"><div class="srd-title">'+Utils.escape(item.title||item.name)+'</div><div class="srd-meta">'+Utils.year(item.release_date||item.first_air_date)+' &middot; '+t.toUpperCase()+'</div></div></div>';
      }).join('');
      
      container.innerHTML = html;
      
      if(data && (data.total_results > r.slice(0, 8).length || data.total_pages > 1)) {
        var btnHtml = '<div class="srd-view-all" onclick="document.getElementById(\'search-input\').blur(); Search.executeFullSearch(\''+Utils.escape(q).replace(/'/g, "\\'")+'\')">View all results <i class="fas fa-arrow-right" style="margin-left:5px;"></i></div>';
        container.insertAdjacentHTML('beforeend', btnHtml);
      }
    }).catch(err => {
      this.isDropdownFetching = false;
    });
  },
  initDropdownObserver: function() {
    // Deprecated: Dropdown uses 'View all results' button now instead of infinite scroll
  },
  closeDropdown: function(){ document.getElementById('search-dropdown').classList.remove('open'); },
  executeFullSearch: function(q, isAppend) {
    if(!q || !q.trim()) return;
    this.closeDropdown();
    if (!isAppend) {
      App.showPage('page-search');
    }
    var titleEl = document.getElementById('search-title');
    if(titleEl) titleEl.innerText = 'Search Results for "'+q+'"';
    var spinner = document.getElementById('search-spinner');
    if(spinner) spinner.classList.remove('hidden');
    var grid = document.getElementById('search-full-grid');
    
    if(!isAppend) {
      if(grid) grid.innerHTML = '';
      State.browsePage = 1;
      State.hasMore = true;
    }
    
    State.isFetching = true;
    
    API.search(q, State.browsePage).then(data => {
      State.isFetching = false;
      if(spinner) spinner.classList.add('hidden');
      var r = ((data && data.results) || []).filter(x => x.poster_path && x.media_type!=='person');
      if(grid) {
        if(!isAppend && !r.length) { 
          grid.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">No results found.</div>';
          State.hasMore = false;
        } else if (r.length) {
          var html = r.map(item => Render.posterCard(item, item.media_type||'movie')).join('');
          if(isAppend) grid.insertAdjacentHTML('beforeend', html);
          else grid.innerHTML = html;
        }
        if (data && data.page >= data.total_pages) {
          State.hasMore = false;
        } else if (State.hasMore && window.observerSearch) {
          var sentinelSearch = document.getElementById('search-infinite-scroll-trigger');
          if (sentinelSearch) {
            window.observerSearch.disconnect();
            window.observerSearch.observe(sentinelSearch);
          }
        }
      }
    }).catch(err => {
      State.isFetching = false;
      if (spinner) spinner.classList.add('hidden');
      if (isAppend) State.browsePage--;
      else if (grid) {
        grid.innerHTML = '<div style="padding:40px;text-align:center;color:var(--cv-red);grid-column:1/-1;"><i class="fas fa-wifi" style="margin-bottom:10px;font-size:24px;display:block;"></i> Network error. Please check your connection.</div>';
      }
    });
  },
  focusMobile: function(){
    window.scrollTo({top:0,behavior:'smooth'});
    setTimeout(function() { document.getElementById('search-input').focus(); }, 300);
  }
};

var HScrollLoad = {
  config: {
    'row-home-genre': {
      page: 2, fetching: false, hasMore: true,
      fetch: function(page) {
        var fetchType = HomeGenre.type === 'anime' ? 'tv' : HomeGenre.type;
        var params = {page: page, sort_by:'popularity.desc'};
        if (HomeGenre.genreId !== 'all') params.with_genres = HomeGenre.genreId;
        if (HomeGenre.type === 'anime') {
          params.with_original_language = 'ja';
          params.with_genres = HomeGenre.genreId !== 'all' ? HomeGenre.genreId + ',16' : 16;
        }
        return API.discover(fetchType, params);
      }
    },
    'row-trending': {
      page: 2, fetching: false, hasMore: true,
      fetch: function(page) { return API.trending('all', page); }
    },
    'row-tvshows': {
      page: 2, fetching: false, hasMore: true,
      fetch: function(page) { return API.popular('tv', page); }
    },
    'row-newreleases': {
      page: 2, fetching: false, hasMore: true,
      fetch: function(page) { return API.upcoming(page); }
    }
  },
  reset: function(id) {
    if(this.config[id]) {
      this.config[id].page = 2;
      this.config[id].fetching = false;
      this.config[id].hasMore = true;
    }
  },
  init: function() {
    ['row-home-genre', 'row-trending', 'row-tvshows', 'row-newreleases'].forEach(function(id) {
      var container = document.getElementById(id);
      if(!container) return;
      var isScrolling = false;
      container.addEventListener('scroll', function() {
        if (!isScrolling) {
          window.requestAnimationFrame(function() {
            var maxScroll = container.scrollWidth - container.clientWidth;
            if (maxScroll > 0 && container.scrollLeft > maxScroll - 800) {
              HScrollLoad.trigger(id);
            }
            isScrolling = false;
          });
          isScrolling = true;
        }
      }, {passive: true});
    });
  },
  trigger: function(id) {
    var cfg = this.config[id];
    if (!cfg || cfg.fetching || !cfg.hasMore) return;
    cfg.fetching = true;
    cfg.page++;
    
    var container = document.getElementById(id);
    cfg.fetch(cfg.page).then(function(data) {
      if (!data || !data.results || data.results.length === 0) {
        cfg.hasMore = false;
      } else {
        var type = 'movie'; 
        if (id === 'row-tvshows') type = 'tv';
        else if (id === 'row-home-genre') type = HomeGenre.type === 'anime' ? 'tv' : HomeGenre.type;
        
        var html = data.results.map(function(x) {
          return Render.posterCard(x, id === 'row-trending' ? null : type);
        }).join('');
        container.insertAdjacentHTML('beforeend', html);
        
        if (data.page >= data.total_pages) cfg.hasMore = false;
      }
      cfg.fetching = false;
    }).catch(function(err){
      cfg.fetching = false;
      cfg.page--;
    });
  }
};

var HomeGenre = {
  type: 'movie',
  genreId: 'all',
  init: function() {
    this.renderBtns();
    this.load();
  },
  setType: function(type, el) {
    this.type = type;
    document.querySelectorAll('.bgt-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    var ind = document.getElementById('bgt-indicator');
    if(ind) {
      ind.style.left = el.offsetLeft + 'px';
      ind.style.width = el.offsetWidth + 'px';
    }
    this.load();
  },
  setGenre: function(id, el) {
    this.genreId = id;
    document.querySelectorAll('.genre-sq-btn').forEach(b => b.classList.remove('active'));
    if(el) {
      el.classList.add('active');
      var ind = document.getElementById('genre-sq-indicator');
      if(ind) {
        ind.style.left = el.offsetLeft + 'px';
        ind.style.width = el.offsetWidth + 'px';
      }
    }
    this.load();
  },
  renderBtns: function() {
    var html = '<div class="genre-sq-indicator" id="genre-sq-indicator"></div>';
    html += '<div class="genre-sq-btn ' + (this.genreId === 'all' ? 'active' : '') + '" onclick="HomeGenre.setGenre(\'all\', this)">ALL</div>';
    html += CFG.GENRES.map(g => {
      var act = g.id === this.genreId ? 'active' : '';
      return '<div class="genre-sq-btn '+act+'" onclick="HomeGenre.setGenre('+g.id+', this)">'+g.name+'</div>';
    }).join('');
    document.getElementById('home-genre-btns').innerHTML = html;
    setTimeout(() => {
      var activeEl = document.querySelector('.genre-sq-btn.active');
      var ind = document.getElementById('genre-sq-indicator');
      if(activeEl && ind) {
        ind.style.left = activeEl.offsetLeft + 'px';
        ind.style.width = activeEl.offsetWidth + 'px';
      }
      var bgtActive = document.querySelector('.bgt-btn.active');
      var bgtInd = document.getElementById('bgt-indicator');
      if(bgtActive && bgtInd) {
        bgtInd.style.left = bgtActive.offsetLeft + 'px';
        bgtInd.style.width = bgtActive.offsetWidth + 'px';
      }
    }, 50);
  },
  load: function() {
    HScrollLoad.reset('row-home-genre');
    var container = document.getElementById('row-home-genre');
    container.innerHTML = Utils.skeletonHtml(8, true);
    
    var fetchType = this.type === 'anime' ? 'tv' : this.type;
    var params = {page:1, sort_by:'popularity.desc'};
    
    if (this.genreId !== 'all') {
      params.with_genres = this.genreId;
    }
    
    if (this.type === 'anime') {
      params.with_original_language = 'ja';
      params.with_genres = this.genreId !== 'all' ? this.genreId + ',16' : 16;
    }

    var p1 = API.discover(fetchType, Object.assign({}, params, {page: 1}));
    var p2 = API.discover(fetchType, Object.assign({}, params, {page: 2}));

    Promise.all([p1, p2]).then(res => {
      var data = res[0];
      if (res[1] && res[1].results) data.results = data.results.concat(res[1].results);
      
      if(!data || !data.results || !data.results.length) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);width:100%">No titles found.</div>';
        return;
      }
      // To give a more "random" feel across all genres, we can shuffle the results if 'all' is selected
      var results = data.results;
      if (this.genreId === 'all') {
        results = results.sort(() => Math.random() - 0.5);
      }
      container.innerHTML = results.map(item => Render.posterCard(item, fetchType)).join('');
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
        + '<h2 class="spotlight-title">'+Utils.escape(title)+'</h2>'
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
    
    th.innerHTML = data.map((x,i) => '<div class="spotlight-thumb '+(i===0?'active':'')+'" onclick="Spotlight.goTo('+i+')"><img alt="Spotlight Thumbnail" src="'+CFG.IMG185+x.backdrop_path+'" loading="lazy" decoding="async" onerror="this.src=Utils.placeholder()"/></div>').join('');
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

function initScrollButtons(){
  document.querySelectorAll('.cv-hscroll').forEach(function(el){
    if (el.dataset.btnInit === 'true') return;
    el.dataset.btnInit = 'true';

    var wrapper = document.createElement('div');
    wrapper.className = 'hscroll-wrapper';
    wrapper.style.position = 'relative';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);

    var btnLeft = document.createElement('div');
    btnLeft.className = 'hscroll-btn left';
    btnLeft.innerHTML = '<i class="fas fa-chevron-left"></i>';
    wrapper.appendChild(btnLeft);

    var btnRight = document.createElement('div');
    btnRight.className = 'hscroll-btn right';
    btnRight.innerHTML = '<i class="fas fa-chevron-right"></i>';
    wrapper.appendChild(btnRight);

    var scrollAmount = window.innerWidth > 768 ? 600 : 300;
    
    btnLeft.addEventListener('click', function(){ el.scrollBy({ left: -scrollAmount, behavior: 'smooth' }); });
    btnRight.addEventListener('click', function(){ el.scrollBy({ left: scrollAmount, behavior: 'smooth' }); });

    var updateBtns = function() {
      if(el.scrollLeft > 20) btnLeft.classList.add('visible'); else btnLeft.classList.remove('visible');
      var maxScroll = el.scrollWidth - el.clientWidth;
      if(el.scrollLeft < maxScroll - 20 && maxScroll > 0) btnRight.classList.add('visible'); else btnRight.classList.remove('visible');
    };

    var updateBtnsRaf = false;
    el.addEventListener('scroll', function() {
      if (!updateBtnsRaf) {
        window.requestAnimationFrame(function() {
          updateBtns();
          updateBtnsRaf = false;
        });
        updateBtnsRaf = true;
      }
    }, {passive: true});
    
    // Initial update delayed to allow content rendering
    setTimeout(updateBtns, 500);
    
    // Observe content changes (e.g. dynamically loaded posters), debounced
    var observerTimeout = null;
    var observer = new MutationObserver(function() {
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(updateBtns, 100);
    });
    observer.observe(el, { childList: true, subtree: true });
    var resizeTimeout = null;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateBtns, 100);
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
    var rating = item.vote_average ? item.vote_average.toFixed(1) : '';
    var ratingHtml = rating ? '<span class="pc-rating"><i class="fas fa-star"></i>'+rating+'</span>' : '';
    var year = Utils.year(item.release_date||item.first_air_date);
    var yearHtml = year && year !== 'N/A' ? '<span>'+year+'</span>' : '';
    var genre = Utils.genreNames(item.genre_ids);
    var genreHtml = genre !== 'General' ? '<span class="pc-genre">'+Utils.escape(genre.split(',')[0])+'</span>' : '';
    var isNew = item.release_date && (new Date(item.release_date) > new Date(Date.now()-60*24*60*60*1000));
    var badge = isNew ? '<span class="pc-badge pc-badge-new">NEW</span>' : (mType==='tv' ? '<span class="pc-badge pc-badge-quality">TV SERIES</span>' : '');
    var inWl = State.watchlist.some(function(w){return w.id===item.id;});
    var wlClass = inWl?'in-list':''; var wlIcon=inWl?'fa-check':'fa-heart';
    return '<div class="poster-card" onclick="Modal.openFull('+item.id+', '+Utils.jsAttr(mType)+')">'
      + '<div class="poster-card-img-wrap">'
      + '<img class="poster-card-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'" onerror="this.src=Utils.placeholder()"/>'
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
      + '<div class="lc-img-wrap"><img class="lc-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'" onerror="this.src=Utils.placeholder()"/><div class="lc-overlay"></div>'
      + '<div class="lc-top"><span class="pc-badge pc-badge-quality">'+(mType==='tv'?'TV SERIES':'MOVIE')+'</span>'+ratingHtml+'</div>'
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
      + '<img class="compact-card-img" src="'+img+'" loading="lazy" decoding="async" alt="'+Utils.escape(title)+'" onerror="this.src=Utils.placeholder()"/>'
      + '<div class="compact-card-info"><div class="compact-card-title">'+Utils.escape(title)+'</div><div class="compact-card-meta">'+year+' &middot; '+genre.split(',')[0]+'</div></div>'
      + '<div class="compact-card-right"><span class="compact-card-rating"><i class="fas fa-star"></i> '+rating+'</span><span style="font-size:11px;color:var(--text-4);">'+(mType==='tv'?'TV Series':'Movie')+'</span></div>'
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
        if (data && data.page >= data.total_pages) {
          State.hasMore = false;
        } else if (State.hasMore && window.observerBrowse) {
          var sentinel = document.getElementById('infinite-scroll-trigger');
          if (sentinel) {
            window.observerBrowse.unobserve(sentinel);
            window.observerBrowse.observe(sentinel);
          }
        }
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
        if (data && data.page >= data.total_pages) {
          State.hasMore = false;
        } else if (State.hasMore && window.observerBrowse) {
          var sentinel = document.getElementById('infinite-scroll-trigger');
          if (sentinel) {
            window.observerBrowse.unobserve(sentinel);
            window.observerBrowse.observe(sentinel);
          }
        }
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
    
    var adFreeVideo = document.getElementById('native-player-adfree');
    if (adFreeVideo) {
      adFreeVideo.pause();
      adFreeVideo.removeAttribute('src');
      adFreeVideo.load();
    }
    if (typeof AdFreePlayer !== 'undefined' && AdFreePlayer.hls) {
      AdFreePlayer.hls.destroy();
      AdFreePlayer.hls = null;
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
    document.getElementById('fv-actor-section').style.display = 'none';
    document.getElementById('fv-actor-movies').innerHTML = '';
    Prog.start();
    API.detail(id, type).then(data => {
      this.isOpening = false; 
      if(!data){ Toast.show('Error loading details.'); Prog.done(); return; }
      State.activeData = data;
      document.getElementById('fv-backdrop').src = type==='person' ? (data.profile_path?CFG.ORIG+data.profile_path:Utils.placeholder()) : CFG.ORIG+(data.backdrop_path||data.poster_path);
      document.getElementById('fv-poster').src = type==='person' ? (data.profile_path?CFG.IMG342+data.profile_path:Utils.placeholder()) : CFG.IMG342+data.poster_path;
      document.getElementById('fv-title').textContent = data.title||data.name;
      document.title = (type==='person' ? "Profile: " : "Watching ") + (data.title||data.name) + " \u2014 StreamHeaven";
      document.getElementById('fv-year').textContent = type==='person' ? (data.known_for_department||'') : Utils.year(data.release_date||data.first_air_date);
      document.getElementById('fv-rating').textContent = type==='person' ? (data.popularity?data.popularity.toFixed(1):'N/A') : (data.vote_average ? data.vote_average.toFixed(1) : 'N/A');
      document.getElementById('fv-desc').innerHTML = type==='person' ? (data.biography?data.biography.replace(/\n/g,'<br>'):'No biography.') : (data.overview||'No overview available.');
      document.getElementById('fv-genre').textContent = type==='person' ? (data.place_of_birth||'') : (data.genres||[]).map(x=>x.name).join(', ');
      document.getElementById('fv-runtime').textContent = type==='person' ? (data.birthday?('Born: '+data.birthday):'') : (type==='movie'?Utils.runtime(data.runtime):((data.number_of_seasons||1)+' Season(s)'));
      
      var cast = type==='person' ? ((data.combined_credits&&data.combined_credits.cast)||[]).filter(x=>x.poster_path).sort((a,b)=>b.popularity-a.popularity).slice(0,20) : ((data.credits&&data.credits.cast)||[]).slice(0,10);
      
      if(type==='person') {
         document.getElementById('fv-cast').innerHTML = '<div style="font-size:16px; font-weight:600; margin-bottom:10px; width:100%; color:var(--text-1);">Known For</div>' + cast.map(item => Render.posterCard(item, item.media_type || 'movie')).join('');
      } else {
         document.getElementById('fv-cast').innerHTML = cast.map(c => {
            var safeName = Utils.escape(c.name).replace(/'/g, "\\'");
            return '<div class="cast-card" onclick="Modal.openFull('+c.id+', \'person\')" style="cursor:pointer;"><img alt="'+Utils.escape(c.name)+'" class="cast-avatar" src="'+(c.profile_path?CFG.IMG185+c.profile_path:Utils.placeholder())+'" loading="lazy" decoding="async" onerror="this.src=Utils.placeholder()"/><div class="cast-name">'+Utils.escape(c.name)+'</div><div class="cast-char">'+Utils.escape(c.character||'')+'</div></div>';
         }).join('');
      }
      
      var similar = ((data.similar&&data.similar.results)||[]).filter(x => x.poster_path);
      if(type !== 'person') {
          if(similar.length) {
            document.getElementById('fv-similar').innerHTML = similar.map(item => Render.posterCard(item, item.media_type || type)).join('');
          } else {
            document.getElementById('fv-similar').innerHTML = '<div style="color:var(--text-3); font-size:14px; text-align:center; padding: 20px; width:100%;">No similar titles found.</div>';
          }
      } else {
          document.getElementById('fv-similar').innerHTML = '';
      }
      
      var fvTabs = document.querySelector('.fv-tabs');
      if (fvTabs) fvTabs.style.display = type==='person' ? 'none' : 'flex';
      var playBtn = document.querySelector('.btn-fv-play');
      if (playBtn) playBtn.style.display = type==='person' ? 'none' : 'inline-flex';
      
      var epNav = document.getElementById('ep-nav-controls');
      var epNavAdFree = document.getElementById('ep-nav-controls-adfree');
      if(type==='tv'){
        if(epNav) epNav.style.display = 'flex';
        if(epNavAdFree) epNavAdFree.style.display = 'flex';
        var validSeasons = (data.seasons || []).filter(function(s) { return s.season_number >= 0; });
        if (validSeasons.length === 0) {
          var maxS = data.number_of_seasons || 1;
          validSeasons = Array.from({length: maxS}, function(_,i) { return {season_number: i+1, episode_count: 24}; });
        }
        
        var seasonHtml = validSeasons.map(function(s) {
           var label = s.season_number === 0 ? 'Specials' : 'Season ' + s.season_number;
           return '<option value="'+s.season_number+'">'+label+'</option>';
        }).join('');
        document.getElementById('ep-season').innerHTML = seasonHtml;
        if(document.getElementById('ep-season-adfree')) document.getElementById('ep-season-adfree').innerHTML = seasonHtml;
        
        var hasSeason1 = validSeasons.some(function(s) { return s.season_number === 1; });
        var hist = State.history.find(function(h){return h.id===id && h.type==='tv';});
        if(hist && hist.season !== null && hist.season !== undefined) {
          document.getElementById('ep-season').value = hist.season;
          if(document.getElementById('ep-season-adfree')) document.getElementById('ep-season-adfree').value = hist.season;
        } else if (hasSeason1) {
          document.getElementById('ep-season').value = "1";
          if(document.getElementById('ep-season-adfree')) document.getElementById('ep-season-adfree').value = "1";
        }
        
        Player.updateEpisodes();
        if(typeof AdFreePlayer !== 'undefined') AdFreePlayer.updateEpisodes();
        
        if(hist && hist.episode !== null && hist.episode !== undefined) {
          var maxEp = document.getElementById('ep-episode').options.length;
          document.getElementById('ep-episode').value = Math.min(hist.episode, maxEp);
          if(document.getElementById('ep-episode-adfree')) document.getElementById('ep-episode-adfree').value = Math.min(hist.episode, maxEp);
        }
        
      } else { 
        if(epNav) epNav.style.display = 'none';
        if(epNavAdFree) epNavAdFree.style.display = 'none';
      }

      var serverHtml = '<div style="font-size:13px; color:var(--text-2); margin-bottom: 5px; font-weight: 500; margin-left: 2px;">Select server</div>';
      serverHtml += '<div class="ep-nav" style="margin-top:0; margin-bottom: 14px; width:100%; justify-content: flex-start;"><div class="ep-selects" style="width:100%; flex: 1 1 100%;"><div class="custom-select" style="min-width:200px; width:100%">';
      serverHtml += '<select id="regular-server-select" onchange="Player.switchServer(this.value)">';
      serverHtml += CFG.SERVERS.map((s,i) => '<option value="'+i+'">' + s.name + '</option>').join('');
      serverHtml += '</select></div></div></div>';
      var sTabs = document.getElementById('server-tabs');
      sTabs.className = '';
      sTabs.innerHTML = serverHtml;
      State.activeServer = 0;

      var trailerContainer = document.getElementById('trailer-container');
      State.activeTrailer = null;
      if (data.videos && data.videos.results) {
        var trailer = data.videos.results.find(function(v){return v.site==='YouTube' && v.type==='Trailer';});
        if (!trailer) trailer = data.videos.results.find(function(v){return v.site==='YouTube';});
        if (trailer) State.activeTrailer = trailer.key;
      }
      if (trailerContainer) {
        if (State.activeTrailer) trailerContainer.style.display = 'block';
        else trailerContainer.style.display = 'none';
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
      CustomSelect.init(); // Initialize combobox synchronously for 'watch' tab
      UIHelper.lockScroll();
      document.getElementById('modal-overlay').classList.add('open');
      Prog.done();
    }).catch(err => {
      this.isOpening = false; 
      Toast.show('Error loading details.');
      Prog.done();
    });
  },
  loadActorMovies: function(personId, personName) {
    Prog.start();
    fetch(CFG.BASE + '/person/' + personId + '/combined_credits')
      .then(res => res.json())
      .then(data => {
        var section = document.getElementById('fv-actor-section');
        var header = document.getElementById('fv-actor-header');
        var container = document.getElementById('fv-actor-movies');
        
        var movies = (data.cast || []).filter(x => x.poster_path).sort((a,b) => b.popularity - a.popularity).slice(0, 30);
        
        if (movies.length > 0) {
          section.style.display = 'block';
          header.textContent = personName.toUpperCase() + ' - KNOWN FOR';
          container.innerHTML = movies.map(item => Render.posterCard(item, item.media_type || 'movie')).join('');
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          section.style.display = 'none';
          Toast.show('No titles found for ' + personName);
        }
        Prog.done();
      }).catch(err => {
        Toast.show('Error loading actor info.');
        Prog.done();
      });
  }
};

var Player = {
  switchServer: function(idx){
    State.activeServer = idx;
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
      var label = sNumber === 0 ? 'Special ' + (i+1) : 'Episode ' + (i+1);
      return '<option value="'+(i+1)+'">'+label+'</option>'; 
    }).join('');
    
    if (currentEp <= count) eSelect.value = currentEp;
    CustomSelect.init();
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
    
    var wrap = iframe.parentNode;
    wrap.classList.add('is-loading');
    iframe.classList.remove('loaded');
    iframe.onload = function() { 
      iframe.classList.add('loaded'); 
      wrap.classList.remove('is-loading');
    }; 
    iframe.src = url;
    // Safety net: hide the spinner if the embed never fires its load event
    setTimeout(function(){ wrap.classList.remove('is-loading'); }, 12000);
    
    if(State.activeData) History.add(State.activeId,State.activeType,State.activeData.title||State.activeData.name,State.activeData.poster_path,season,episode,State.activeData.vote_average,State.activeData.release_date||State.activeData.first_air_date);
  }
};

var AdFreePlayer = {
  hls: null,
  updateEpisodes: function() {
    if (State.activeType !== 'tv' || !State.activeData || !State.activeData.seasons) return;
    var sSelect = document.getElementById('ep-season-adfree');
    var eSelect = document.getElementById('ep-episode-adfree');
    var sNumber = Number(sSelect.value || 1);
    
    var season = State.activeData.seasons.find(function(s) { return s.season_number === sNumber; });
    var count = season ? season.episode_count : 24; 
    if (count === 0) count = 1;
    
    var currentEp = Number(eSelect.value || 1);
    eSelect.innerHTML = Array.from({length: count}, function(_,i) { 
      var label = sNumber === 0 ? 'Special ' + (i+1) : 'Episode ' + (i+1);
      return '<option value="'+(i+1)+'">'+label+'</option>'; 
    }).join('');
    
    if (currentEp <= count) eSelect.value = currentEp;
    CustomSelect.init();
  },
  nextEpisode: function(){
    if(State.activeType !== 'tv') return;
    var sSelect = document.getElementById('ep-season-adfree');
    var eSelect = document.getElementById('ep-episode-adfree');
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
    var sSelect = document.getElementById('ep-season-adfree');
    var eSelect = document.getElementById('ep-episode-adfree');
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
    var video = document.getElementById('native-player-adfree');
    var sTabs = document.getElementById('server-tabs-adfree');
    video.style.display = 'none';
    if(this.hls) { this.hls.destroy(); this.hls = null; }
    
    var season = null, episode = null;
    var apiUrl = '';
    
    if (State.activeType === 'tv') {
      season = Number(document.getElementById('ep-season-adfree').value || 1);
      episode = Number(document.getElementById('ep-episode-adfree').value || 1);
      apiUrl = 'https://streamheaven-api.onrender.com/api/streams/series/' + State.activeId + '?season=' + season + '&episode=' + episode;
    } else {
      apiUrl = 'https://streamheaven-api.onrender.com/api/streams/' + State.activeType + '/' + State.activeId;
    }
    
    var startTime = Date.now();
    sTabs.innerHTML = '<div style="padding:10px; color:var(--text-3);" id="adfree-status"><i class="fas fa-circle-notch fa-spin" style="margin-right:8px;"></i> Searching for streams...</div>';
    
    // If it takes more than 4 seconds, Render is likely waking up from sleep
    var checkWakeup = setInterval(function() {
      var statusEl = document.getElementById('adfree-status');
      if (statusEl && (Date.now() - startTime) > 4000) {
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px; color:var(--cv-purple);"></i> Waking up ad-free servers... (this can take ~30s)';
        statusEl.style.color = 'var(--text-1)';
      }
    }, 1000);

    // Smart fetch with auto-retry
    var fetchStreams = function(retries) {
      return fetch(apiUrl)
        .then(r => {
          // Render might return 502/503 while spinning up container
          if (!r.ok && retries > 0) throw new Error('Retry');
          if (!r.ok) throw new Error('Stream service unavailable');
          
          var ct = r.headers.get('content-type') || '';
          if (ct.indexOf('application/json') === -1 && retries > 0) throw new Error('Retry');
          if (ct.indexOf('application/json') === -1) throw new Error('Stream service unavailable');
          
          return r.json();
        })
        .catch(e => {
          if (e.message === 'Retry' && retries > 0) {
            return new Promise(resolve => setTimeout(resolve, 4000)).then(() => fetchStreams(retries - 1));
          }
          throw e;
        });
    };
    
    fetchStreams(3)
      .then(resp => {
        clearInterval(checkWakeup);
        var streams = resp.streams || resp;
        if (!streams || !streams.length || streams.length === 0) {
          sTabs.innerHTML = '<div style="padding:10px; color:var(--cv-red);">No streams found. Try the regular Watch tab.</div>';
          return;
        }
        
        var html = '<div style="font-size:13px; color:var(--text-2); margin-bottom: 5px; font-weight: 500; margin-left: 2px;">Select server</div>';
        html += '<div class="ep-nav" style="margin-top:0; margin-bottom: 14px; width:100%; justify-content: flex-start;"><div class="ep-selects" style="width:100%; flex: 1 1 100%;"><div class="custom-select" style="min-width:200px; width:100%">';
        html += '<select id="adfree-server-select" onchange="AdFreePlayer.onServerSelect(this.value)">';
        AdFreePlayer.streams = streams;
        streams.forEach((s, idx) => {
           html += '<option value="'+idx+'">' + (s.name || s.provider) + ' (' + (s.quality || '?') + ')</option>';
        });
        html += '</select></div></div></div>';
        
        sTabs.className = ''; // Remove flex layout from container
        sTabs.innerHTML = html;
        CustomSelect.init();
        
        AdFreePlayer.onServerSelect(0);
      })
      .catch(e => {
        clearInterval(checkWakeup);
        console.error('AdFree Fetch Error:', e);
        sTabs.innerHTML = '<div style="padding:10px; color:var(--cv-red);">Ad-Free streams are unavailable right now. Try the regular Watch tab instead.</div>';
      });
  },
  onServerSelect: function(idx) {
    var s = AdFreePlayer.streams[idx];
    if(!s) return;
    var streamType = 'm3u8';
    if (s.title && s.title.toLowerCase().indexOf('mp4') !== -1) streamType = 'mp4';
    if (s.url && s.url.toLowerCase().indexOf('.mp4') !== -1) streamType = 'mp4';
    AdFreePlayer.playStream(s.url, streamType);
  },
  playStream: function(url, type) {
    var video = document.getElementById('native-player-adfree');
    var wrap = document.getElementById('player-wrap-adfree');
    video.style.display = 'block';
    wrap.classList.add('is-loading');
    var stopLoading = function(){ wrap.classList.remove('is-loading'); };
    // Hide the spinner the moment playback actually begins (not while merely buffering)
    video.addEventListener('playing', stopLoading, { once: true });
    video.addEventListener('canplay', stopLoading, { once: true });
    video.addEventListener('error', stopLoading, { once: true });
    setTimeout(stopLoading, 15000);
    
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    
    if (type === 'm3u8' && typeof Hls !== 'undefined' && Hls.isSupported()) {
      this.hls = new Hls({ xhrSetup: function(xhr) { xhr.timeout = 15000; } });
      this.hls.loadSource(url);
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, function() {
        video.play().catch(e => console.log('Autoplay prevented', e));
      });
      this.hls.on(Hls.Events.ERROR, function(event, data) {
        if (data.fatal) {
          stopLoading();
          console.error('HLS Fatal Error:', data.type, data.details);
          var sTabs = document.getElementById('server-tabs-adfree');
          var errDiv = document.getElementById('adfree-error');
          if (!errDiv) {
            errDiv = document.createElement('div');
            errDiv.id = 'adfree-error';
            errDiv.style.cssText = 'padding:10px;color:#ff6b6b;text-align:center;font-size:13px;';
            sTabs.parentNode.insertBefore(errDiv, sTabs.nextSibling);
          }
          errDiv.textContent = 'This server failed to load. Try clicking another server button above.';
        }
      });
    } else {
      video.src = url;
      video.play().catch(e => console.log('Autoplay prevented', e));
    }
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
    else {
      var iframe = document.getElementById('main-player');
      if (iframe && iframe.src && iframe.src !== 'about:blank') {
        var clone = iframe.cloneNode(true);
        clone.setAttribute('src', 'about:blank');
        iframe.parentNode.replaceChild(clone, iframe);
      }
    }
    
    if(t==='watch_adfree') AdFreePlayer.loadVideo();
    else {
      if (typeof AdFreePlayer !== 'undefined' && AdFreePlayer.hls) {
         AdFreePlayer.hls.destroy();
         AdFreePlayer.hls = null;
      }
      var nativeVideo = document.getElementById('native-player-adfree');
      if (nativeVideo) {
         nativeVideo.pause();
         nativeVideo.removeAttribute('src');
         nativeVideo.load();
      }
    }
    
    if(t==='overview' && State.activeTrailer) {
       document.getElementById('trailer-player').src = 'https://www.youtube.com/embed/' + State.activeTrailer + '?autoplay=1&mute=1';
    } else {
       var tp = document.getElementById('trailer-player');
       if (tp && tp.src && tp.src !== 'about:blank') {
         var tpClone = tp.cloneNode(true);
         tpClone.setAttribute('src', 'about:blank');
         tp.parentNode.replaceChild(tpClone, tp);
       }
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
      if(typeof currentUser === 'undefined' || !currentUser) {
        if(typeof AuthUI !== 'undefined') AuthUI.openLogin();
        else Toast.show('Please log in to add to your wishlist', 'error');
        return false;
      }
      var idx=State.watchlist.findIndex(function(x){return x.id===id;});
      var added=false;
      if(idx===-1){
        State.watchlist.unshift({id:id,type:type,title:title,poster_path:poster,vote_average:vote,release_date:date});
        added=true;
        Toast.show('Added to watchlist','success');
      }
      else{
        State.watchlist.splice(idx,1);
        Toast.show('Removed from watchlist','info');
      }
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
  load: function(){this.render();},
  render: function(){
    let el = document.getElementById('history-grid');
    if(!el) return;
    el.innerHTML = State.history.map(function(x){
      return Render.posterCard(x, x.type);
    }).join('') || '<div style="padding:40px;text-align:center;color:var(--text-3);grid-column:1/-1;">Your watch history is empty.</div>';
  },
  clearAll: function(){
    if(!State.history.length){Toast.show('Watch history is already empty.','info');return;}
    Confirm.open('Clear History', 'Are you sure you want to clear your watch history?', function() {
      State.history=[];
      Library.saveUserData();
      History.render();
      Toast.show('History cleared successfully.','success');
    });
  }
};


/* ================================================================
   08. LEGAL & POLICY MODAL 
================================================================ */
var Legal = {
  content: {
    dmca: { title: 'DMCA Copyright Policy', html: '<p>StreamHeaven respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act (DMCA), we will respond expeditiously to claims of copyright infringement committed using our service.</p><h3>Reporting Copyright Infringement</h3><p>StreamHeaven does not host any media files, movies, TV series, or anime on its servers or its Ad-Free servers. All contents are provided by non-affiliated third parties and fetched dynamically. If you believe that your copyrighted work is accessible on StreamHeaven without authorization, please submit a DMCA notice including:</p><p>&bull; Identification of the copyrighted work claimed to have been infringed.<br>&bull; The exact URL or location on our site where the material is located.<br>&bull; Your contact information (Name, Email, Phone Number).<br>&bull; A statement of good faith belief that the disputed use is not authorized by the copyright owner.</p><p>Contact our DMCA agent at: <strong>streamheaven.support@gmail.com</strong></p>' },
    privacy: { title: 'Privacy Policy', html: '<p>Your privacy is important to StreamHeaven. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website or application.</p><h3>1. Information We Store</h3><p>To provide a personalized experience, we store your username and customized watchlist securely in our database. This allows you to log in and access your saved content across different devices. We do not sell or share any of this personal data with third parties.</p><h3>2. Third-Party Services</h3><p>We utilize the TMDB API for movie, TV show, and anime metadata and imagery. Third-party video embedding providers and our Ad-Free routing servers may use standard web trackers to deliver media streams.</p>' },
    terms: { title: 'Terms of Service', html: '<p>Welcome to StreamHeaven. By accessing or using our website and application, you agree to be bound by these Terms of Service.</p><h3>1. Acceptance of Terms</h3><p>You must be at least 13 years of age to use this platform. By using StreamHeaven, you warrant that you meet this age requirement.</p><h3>2. Third-Party Content Disclaimer</h3><p>StreamHeaven does not host, upload, or stream any video files on its servers. All videos, anime, and media content are hosted by external third-party services. We assume no responsibility or liability for the content hosted on third-party servers.</p>' },
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
    try{
      localStorage.setItem(WATCH_KEY,JSON.stringify(State.watchlist));
      localStorage.setItem(HISTORY_KEY,JSON.stringify(State.history));
      if (typeof window.syncUserDataToCloud === 'function') {
        window.syncUserDataToCloud(State.watchlist, State.history);
      }
    }
    catch(e){console.error('Unable to save media data:',e);}
  }

  function init(){
    loadUserData();
  }

  return {
    init:init, saveUserData:saveUserData
  };
})();


/* ================================================================
   10. INITIALIZATION
================================================================ */
document.addEventListener('DOMContentLoaded', function(){
  Prog.init();
  Library.init();
  initDragScroll();
  initScrollButtons();
  HScrollLoad.init();

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
    API.trending('all', 1), API.trending('all', 2),
    API.topRated('movie', 1),
    API.popular('tv', 1), API.popular('tv', 2),
    API.upcoming(1), API.upcoming(2)
  ]).then(function(res){
    var tr=res[0]; if(res[1] && res[1].results) tr.results = tr.results.concat(res[1].results);
    var rtd=res[2];
    var tv=res[3]; if(res[4] && res[4].results) tv.results = tv.results.concat(res[4].results);
    var up=res[5]; if(res[6] && res[6].results) up.results = up.results.concat(res[6].results);
    
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
      document.getElementById('row-trending').innerHTML = tr.results.slice(0,35).map(x => Render.posterCard(x)).join('');

      /* 4. Top 10 Today List */
      document.getElementById('list-top10').innerHTML = tr.results.slice(0,10).map((x,i) => Render.compactCard(x, i+1)).join('');
    }

    /* 5. Top Rated Films */
    if(rtd && rtd.results){
      document.getElementById('grid-toprated').innerHTML = rtd.results.slice(0,6).map(x => Render.landscapeCard(x,'movie')).join('');
    }

    /* 6. TV Series */
    if(tv && tv.results){
      document.getElementById('row-tvshows').innerHTML = tv.results.slice(0,35).map(x => Render.posterCard(x,'tv')).join('');
    }

    /* 7. New Releases */
    if(up && up.results){
      document.getElementById('row-newreleases').innerHTML = up.results.slice(0,35).map(x => Render.posterCard(x,'movie')).join('');
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
    window.observerBrowse = new IntersectionObserver(function(entries){
      if(entries[0].isIntersecting && State.activePage === 'page-browse' && !State.isFetching && State.hasMore !== false) {
        State.browsePage++;
        if(State.browseMode === 'genre') Browse.byGenre(State.genreId, document.getElementById('header-page-title').textContent, true);
        else Browse.load(true);
      }
    }, {rootMargin: '200px'});
    window.observerBrowse.observe(sentinel);
  }

  // Infinite Scroll Observer for Search
  var sentinelSearch = document.getElementById('search-infinite-scroll-trigger');
  if(sentinelSearch && window.IntersectionObserver) {
    window.observerSearch = new IntersectionObserver(function(entries){
      if(entries[0].isIntersecting && State.activePage === 'page-search' && !State.isFetching && State.hasMore !== false) {
        State.browsePage++;
        Search.executeFullSearch(document.getElementById('search-input').value, true);
      }
    }, {rootMargin: '200px'});
    window.observerSearch.observe(sentinelSearch);
  }


  // Back to Top Button Logic
  var bttIsScrolling = false;
  window.addEventListener('scroll', function() {
    if (!bttIsScrolling) {
      window.requestAnimationFrame(function() {
        var btn = document.getElementById('back-to-top');
        if (btn) {
          if (window.scrollY > 800) btn.classList.add('visible');
          else btn.classList.remove('visible');
        }
        bttIsScrolling = false;
      });
      bttIsScrolling = true;
    }
  }, {passive: true});

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
      var keys = Object.keys(vlData);
      if (keys.length > 100) {
        delete vlData[keys[0]]; // Prune oldest entry to save space
      }
      try { localStorage.setItem('vidLinkProgress', JSON.stringify(vlData)); } catch(e){}
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

/* ================================================================ 
   APPS DOWNLOAD MODAL LOGIC
================================================================ */
function openAppsModal() {
  document.getElementById('apps-modal').style.display = 'flex';
  showPlatformOptions(); // Reset to default view
}

function closeAppsModal() {
  document.getElementById('apps-modal').style.display = 'none';
}

function showIosInstructions() {
  document.getElementById('apps-modal-platforms').style.display = 'none';
  document.getElementById('apps-modal-ios').style.display = 'block';
}

function showPlatformOptions() {
  document.getElementById('apps-modal-ios').style.display = 'none';
  document.getElementById('apps-modal-platforms').style.display = 'block';
}

window.addEventListener('click', function(event) {
  var appsModal = document.getElementById('apps-modal');
  if (event.target == appsModal) {
    closeAppsModal();
  }
});
